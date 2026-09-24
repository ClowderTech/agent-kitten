use ::serenity::all::VoiceState;
use chrono::{DateTime, Utc};
use lavalink_rs::client::LavalinkClient;
use lavalink_rs::model::events::Events;
use lavalink_rs::node::NodeBuilder;
use once_cell::sync::Lazy;
use poise::serenity_prelude as serenity;
use sea_orm::{ActiveModelTrait, ConnectOptions, Database, DatabaseConnection};
use serde_json::{Value, json};
use songbird::SerenityInit;
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use sysinfo::System;
use tokio::signal::unix::{SignalKind, signal};
use tokio::sync::Mutex;

use std::collections::HashMap;
use std::time::Duration;

pub mod commands;
pub mod commands_gen;
use commands_gen::all_commands;

// mod mongo_helpers;
// use mongo_helpers::MongoClient;
// use mongodb::bson::doc;
// use mongodb::{Client, options::ClientOptions};

pub mod textgen_helpers;

pub mod config_helpers;
use config_helpers::get_nested_key;

pub mod leveling_helpers;
use leveling_helpers::pretty_exp_gain;

pub mod music_helpers;

pub mod music_events;

pub mod entity;
use entity::server::{ActiveModel as ServerActiveModel, Entity as Server, Model as ServerModel};
use sea_orm::ActiveValue::{NotSet, Set};

#[derive(Clone)]
pub struct Data {
    start_time: DateTime<Utc>,
    // mongoclient: MongoClient,
    lavalink: LavalinkClient,
    system_stats: Arc<Mutex<System>>,
    psql_client: DatabaseConnection,
}
type Error = Box<dyn std::error::Error + Send + Sync>;
type Context<'a> = poise::Context<'a, Data, Error>;

static USERS_MESSAGED: Lazy<Mutex<HashSet<u64>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static USER_VOICE_STATES: Lazy<Mutex<HashMap<u64, VoiceState>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static LOOPS_RUNNING: AtomicBool = AtomicBool::new(false);

#[tokio::main]
async fn main() {
    // let raw_client = Client::with_options(
    //     ClientOptions::parse(std::env::var("MONGODB_URI").expect("Missing MONGODB_URI"))
    //         .await
    //         .expect("MONGODB_URI unparsable"),
    // )
    // .expect("MongoDB unable to connect");
    let opt = ConnectOptions::new(std::env::var("PSQL_URI").expect("Missing PSQL_URI"));
    let db = Database::connect(opt)
        .await
        .expect("Postgres unable to connect");
    db.get_schema_registry("agent-kitten::*")
        .sync(&db)
        .await
        .expect("Postgres unable to register schemas");
    let db_clone = db.clone();

    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            commands: all_commands(),
            event_handler: |framework, event| Box::pin(event_handler(framework, event)),
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
                    events: Events::default(),
                };

                let lavalink_client = LavalinkClient::new(
                    events,
                    vec![node],
                    lavalink_rs::prelude::NodeDistributionStrategy::round_robin(),
                )
                .await;

                Ok(Data {
                    start_time: Utc::now(),
                    // mongoclient: MongoClient::new(
                    //     raw_client,
                    //     _ready.user.display_name().to_string(),
                    // ),
                    lavalink: lavalink_client,
                    system_stats: Arc::new(Mutex::new(System::new_all())),
                    psql_client: db_clone,
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
            let _ = db.close().await;
        }
        _ = tokio::signal::ctrl_c() => {
            println!("Received CTRL + C, shutting down gracefully...");
            client.shard_manager.shutdown_all().await;
            let _ = db.close().await;
        }
    }
}

async fn event_handler(
    framework: poise::FrameworkContext<'_, Data, Error>,
    event: &serenity::FullEvent,
) -> Result<(), Error> {
    let framework = Arc::new(framework);
    let ctx = framework.serenity_context;
    let data = framework.user_data;

    let psql_client = &data.psql_client;

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
                let http_clone = framework.serenity_context.http.clone();
                let psql_client_clone = framework.user_data.psql_client.clone();
                tokio::spawn(async move {
                    loop {
                        level_speakers_in_voice_chats(http_clone.clone(), &psql_client_clone).await;
                        tokio::time::sleep(Duration::from_secs(60)).await;
                    }
                });
                tokio::spawn(async move {
                    loop {
                        reset_text_chatters_limit().await;
                        tokio::time::sleep(Duration::from_secs(60)).await;
                    }
                });
                let system_stats_clone = framework.user_data.system_stats.clone();
                tokio::spawn(async move {
                    loop {
                        update_cpu_stats(&system_stats_clone).await;
                        tokio::time::sleep(Duration::from_secs(10)).await;
                    }
                });
                LOOPS_RUNNING.swap(true, std::sync::atomic::Ordering::Relaxed);
            }
        }
        serenity::FullEvent::VoiceStateUpdate { old: _, new } => {
            let mut voice_states = USER_VOICE_STATES.lock().await;
            if new.guild_id.is_some() && new.channel_id.is_some() {
                voice_states.insert(new.user_id.get(), new.clone());
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

            let content_search: Option<ServerModel> =
                Server::find_by_server_id(guild_id).one(psql_client).await?;

            let content = match content_search {
                Some(content) => content,
                None => {
                    let new_active_model = ServerActiveModel {
                        id: NotSet,
                        server_id: Set(guild_id),
                        config: Set(json!({})),
                    };

                    new_active_model.insert(psql_client).await?
                }
            };

            // Determine multiplier: 2 * Number(getNestedKey(...)) || 1
            let base_multiplier = match get_nested_key(&content.config, "leveling.expmultiplier") {
                Some(cfg) => match cfg {
                    Value::Number(n) => n.as_f64().unwrap_or(1.0),
                    Value::String(s) => s.parse::<f64>().unwrap_or(1.0),
                    Value::Bool(b) => {
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
                &data.psql_client,
                author_id_u64,
                guild_id,
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

async fn level_speakers_in_voice_chats(
    http: Arc<serenity::Http>,
    psql_client: &DatabaseConnection,
) {
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
            let content_search: Option<ServerModel> = Server::find_by_server_id(guild_id)
                .one(psql_client)
                .await
                .unwrap();

            let content = match content_search {
                Some(content) => content,
                None => {
                    let new_active_model = ServerActiveModel {
                        id: NotSet,
                        server_id: Set(guild_id.get()),
                        config: Set(json!({})),
                    };

                    new_active_model.insert(psql_client).await.unwrap()
                }
            };

            // base multiplier from config: try to coerce into a number (f64)
            let base_multiplier = match get_nested_key(&content.config, "leveling.expmultiplier") {
                Some(cfg) => match cfg {
                    Value::Number(n) => n.as_f64().unwrap_or(1.0),
                    Value::String(s) => s.parse::<f64>().unwrap_or(1.0),
                    Value::Bool(b) => {
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
                psql_client,
                *user_id,
                guild_id.get(),
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
