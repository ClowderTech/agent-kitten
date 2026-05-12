use ::serenity::all::VoiceState;
use chrono::{DateTime, Utc};
use lavalink_rs::client::LavalinkClient;
use lavalink_rs::model::events::{self, Events};
use lavalink_rs::node::NodeBuilder;
use once_cell::sync::Lazy;
use poise::serenity_prelude as serenity;
use songbird::SerenityInit;
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use sysinfo::System;
use tokio::signal::unix::{SignalKind, signal};
use tokio::sync::Mutex;

use std::collections::HashMap;
use std::time::Duration;

mod commands;
mod commands_gen;
use commands_gen::all_commands;

mod mongo_helpers;
use mongo_helpers::MongoClient;
use mongodb::bson::doc;
use mongodb::{Client, options::ClientOptions};

mod textgen_helpers;

mod config_helpers;
use config_helpers::{Config, ServerConfig, get_nested_key};

mod leveling_helpers;
use leveling_helpers::pretty_exp_gain;

mod music_helpers;

#[derive(Clone)]
struct Data {
    start_time: DateTime<Utc>,
    mongoclient: MongoClient,
    lavalink: LavalinkClient,
    system_stats: Arc<Mutex<System>>,
}
type Error = Box<dyn std::error::Error + Send + Sync>;
type Context<'a> = poise::Context<'a, Data, Error>;

static USERS_MESSAGED: Lazy<Mutex<HashSet<u64>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static USER_VOICE_STATES: Lazy<Mutex<HashMap<u64, VoiceState>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static LOOPS_RUNNING: AtomicBool = AtomicBool::new(false);

#[tokio::main]
async fn main() {
    let raw_client = Client::with_options(
        ClientOptions::parse(std::env::var("MONGODB_URI").expect("Missing MONGODB_URI"))
            .await
            .expect("MONGODB_URI unparsable"),
    )
    .expect("MongoDB unable to connect");

    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            commands: all_commands(),
            event_handler: |ctx, event, framework, data| {
                Box::pin(event_handler(
                    ctx.clone(),
                    event.clone(),
                    framework,
                    data.clone(),
                ))
            },
            ..Default::default()
        })
        .setup(|ctx, _ready, framework| {
            Box::pin(async move {
                poise::builtins::register_globally(ctx, &framework.options().commands).await?;

                let events = Events {
                    ..Default::default()
                };

                let node = NodeBuilder {
                    hostname: format!(
                        "{}:{}",
                        std::env::var("LAVALINK_HOST").expect("Missing LAVALINK_HOST"),
                        std::env::var("LAVALINK_PORT").expect("Missing LAVALINK_PORT")
                    ),
                    password: std::env::var("LAVALINK_PASSWORD")
                        .expect("Missing LAVALINK_PASSWORD"),
                    user_id: ctx.cache.current_user().id.get().into(),
                    is_ssl: std::env::var("LAVALINK_SECURE")
                        .expect("Missing LAVALINK_SECURE")
                        .contains("true"),
                    session_id: None,
                    events: events::Events::default(),
                };

                let lavalink_client = LavalinkClient::new(
                    events,
                    vec![node],
                    lavalink_rs::prelude::NodeDistributionStrategy::round_robin(),
                )
                .await;

                Ok(Data {
                    start_time: Utc::now(),
                    mongoclient: MongoClient::new(
                        raw_client,
                        _ready.user.display_name().to_string(),
                    ),
                    lavalink: lavalink_client,
                    system_stats: Arc::new(Mutex::new(System::new_all())),
                })
            })
        })
        .build();

    let mut client = serenity::ClientBuilder::new(
        std::env::var("DISCORD_TOKEN").expect("Missing DISCORD_TOKEN"),
        serenity::GatewayIntents::non_privileged(),
    )
    .register_songbird()
    .framework(framework)
    .await
    .expect("Error creating client");

    let mut sig = signal(SignalKind::terminate()).expect("Not recognizing SIGTERM");

    tokio::select! {
        result = client.start_autosharded() => {
            if let Err(err) = result {
                println!("Client error: {err:?}");
            }
        }
        _ = sig.recv() => {
            println!("Received SIGTERM, shutting down gracefully...");
            client.shard_manager.shutdown_all().await;
        }
        _ = tokio::signal::ctrl_c() => {
            println!("Received CTRL + C, shutting down gracefully...");
            client.shard_manager.shutdown_all().await;
        }
    }
}

async fn event_handler(
    ctx: serenity::Context,
    event: serenity::FullEvent,
    _framework: poise::FrameworkContext<'_, Data, Error>,
    data: Data,
) -> Result<(), Error> {
    match event {
        serenity::FullEvent::Ready { data_about_bot, .. } => {
            println!("Client is ready! Logged in as {}", data_about_bot.user.name);
            ctx.set_presence(
                Some(serenity::ActivityData::watching("My pizza in the oven")),
                serenity::OnlineStatus::Online,
            );
        }
        serenity::FullEvent::CacheReady { guilds: _ } => {
            println!("Cache built successfully!");
            if !LOOPS_RUNNING.load(std::sync::atomic::Ordering::Relaxed) {
                tokio::spawn(async move {
                    loop {
                        level_speakers_in_voice_chats(&ctx.http.clone(), &data.mongoclient).await;
                        tokio::time::sleep(Duration::from_secs(60)).await;
                    }
                });
                tokio::spawn(async move {
                    loop {
                        reset_text_chatters_limit().await;
                        tokio::time::sleep(Duration::from_secs(60)).await;
                    }
                });
                tokio::spawn(async move {
                    loop {
                        update_cpu_stats(&data.system_stats).await;
                        tokio::time::sleep(Duration::from_secs(10)).await;
                    }
                });
                LOOPS_RUNNING.swap(true, std::sync::atomic::Ordering::Relaxed);
            }
        }
        serenity::FullEvent::VoiceStateUpdate { old: _, new } => {
            let mut voice_states = USER_VOICE_STATES.lock().await;
            if new.guild_id.is_some() && new.channel_id.is_some() {
                voice_states.insert(new.user_id.get(), new);
            } else {
                voice_states.remove(&new.user_id.get());
            }
        }
        serenity::FullEvent::Message { new_message } => {
            // Ignore bot authors
            if new_message.author.bot {
                return Ok(());
            }

            // Only handle guild messages
            let guild_id = match new_message.guild_id {
                Some(g) => g.get(),
                None => return Ok(()),
            };

            // Query config for this server (serverid stored as string)
            let filter = doc! { "serverid": guild_id.to_string() };
            // Use your MongoClient from data
            let server_data: Vec<ServerConfig> =
                match data.mongoclient.get_data("config", Some(filter)).await {
                    Ok(v) => v,
                    Err(err) => {
                        eprintln!("Failed to fetch server config: {}", err);
                        return Ok(());
                    }
                };

            // Extract config payload (default to empty object)
            let config_data: Config = server_data
                .first()
                .map(|c| c.config.clone())
                .unwrap_or_else(|| Config::Object(std::collections::HashMap::new()));

            // Determine multiplier: 2 * Number(getNestedKey(...)) || 1
            let base_multiplier = match get_nested_key(&config_data, "leveling.expmultiplier") {
                Some(cfg) => match cfg {
                    Config::Num(n) => n,
                    Config::Str(s) => s.parse::<f64>().unwrap_or(1.0),
                    Config::Bool(b) => {
                        // If someone stored boolean accidentally, treat true as 1.0, false as 0.0
                        if b { 1.0 } else { 0.0 }
                    }
                    _ => 1.0,
                },
                None => 1.0,
            };
            let multiplier = 1.0 * base_multiplier;

            // Prevent repeated triggering for the same user in memory
            let author_id_u64 = new_message.author.id.get();
            {
                let mut set = USERS_MESSAGED.lock().await;
                if set.contains(&author_id_u64) {
                    // Already handled recently — skip
                    return Ok(());
                }
                // mark as seen
                set.insert(author_id_u64);
            }

            // Construct a channel URL like the TS code used (guild + channel)
            let channel_url = format!(
                "https://discord.com/channels/{}/{}",
                guild_id, new_message.channel_id
            );

            // Call the pretty_exp_gain function (it returns Option<EmbedData> if you want to DM)
            match pretty_exp_gain(
                &data.mongoclient,
                &author_id_u64.to_string(),
                &guild_id.to_string(),
                &channel_url,
                multiplier,
            )
            .await
            {
                Ok(Some(embed)) => {
                    // If you want to send the DM from here using serenity, do it now.
                    // Example (send an embed to the user as DM):
                    new_message
                        .author
                        .direct_message(&ctx.http, serenity::CreateMessage::new().embed(embed))
                        .await
                        .ok();
                }
                Ok(None) => { /* nothing to do — either no level up or user disabled messages */ }
                Err(e) => {
                    eprintln!("Error running pretty_exp_gain: {}", e);
                }
            }
        }
        _ => {}
    }
    Ok(())
}

async fn level_speakers_in_voice_chats(http: &serenity::Http, mongo_client: &MongoClient) {
    let voice_states = USER_VOICE_STATES.lock().await;
    for (user_id, voice_state) in voice_states.iter() {
        // Use voice_state fields (deaf/mute/self_stream) to evaluate conditions
        let is_deaf = voice_state.deaf;
        let is_mute = voice_state.mute;
        let is_streaming = voice_state.self_stream.unwrap_or(false);

        let guild_id = voice_state.guild_id.unwrap();
        let channel_id = voice_state.channel_id.unwrap();
        let user_id_obj = voice_state.user_id;

        // Mirror your TS condition:
        // ((!deaf && !mute && channelId !== guild.afkChannelId) || streaming)
        if (!is_deaf && !is_mute) || is_streaming {
            // Fetch server config from DB. serverid stored as guild id string.
            let filter = doc! { "serverid": guild_id.to_string() };
            let server_data: Vec<ServerConfig> =
                match mongo_client.get_data("config", Some(filter)).await {
                    Ok(v) => v,
                    Err(err) => {
                        eprintln!("Failed to fetch server config: {}", err);
                        continue;
                    }
                };

            let config_data: Config = server_data
                .first()
                .map(|c| c.config.clone())
                .unwrap_or_else(|| Config::Object(HashMap::new()));

            // base multiplier from config: try to coerce into a number (f64)
            let base_multiplier = match get_nested_key(&config_data, "leveling.expmultiplier") {
                Some(cfg) => match cfg {
                    Config::Num(n) => n,
                    Config::Str(s) => s.parse::<f64>().unwrap_or(1.0),
                    Config::Bool(b) => {
                        if b {
                            1.0
                        } else {
                            0.0
                        }
                    }
                    _ => 1.0,
                },
                None => 1.0,
            };

            // Compute multiplier like the TS expression:
            // ( !deaf && !mute ? 1 : 0 ) + ( streaming ? 1 : 0 ) * Number(getNestedKey(...))
            let voice_presence_part = if !is_deaf && !is_mute { 0.5 } else { 0.0 };
            let streaming_part = if is_streaming { 0.5 } else { 0.0 };
            let multiplier = (voice_presence_part + streaming_part) * base_multiplier;

            // Build a channel URL similar to the TS code
            let channel_url = format!("https://discord.com/channels/{}/{}", guild_id, channel_id);

            // Call your leveling function. Pass user id and guild id as strings.
            // Ignore the returned embed here (you could send it as a DM as you do elsewhere).
            match pretty_exp_gain(
                mongo_client,
                &user_id.to_string(),
                &guild_id.to_string(),
                &channel_url,
                multiplier,
            )
            .await
            {
                Ok(Some(embed)) => {
                    // If you want to send the DM from here using serenity, do it now.
                    // Example (send an embed to the user as DM):
                    user_id_obj
                        .direct_message(&http, serenity::CreateMessage::new().embed(embed))
                        .await
                        .ok();
                }
                Ok(None) => { /* nothing to do — either no level up or user disabled messages */ }
                Err(e) => {
                    eprintln!("Error running pretty_exp_gain: {}", e);
                }
            }
        } // condition end
    } // voice_states for for
}

async fn reset_text_chatters_limit() {
    let mut set = USERS_MESSAGED.lock().await;
    set.clear();
}

async fn update_cpu_stats(system_stats: &Arc<Mutex<System>>) {
    let mut stats = system_stats.lock().await;
    stats.refresh_cpu_all();
}
