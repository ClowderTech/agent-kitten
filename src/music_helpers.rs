use lavalink_rs::model::ChannelId;
use lavalink_rs::model::player::ConnectionInfo;
use poise::serenity_prelude as serenity;

use crate::{Context, Error};

pub async fn _join(
    ctx: &Context<'_>,
    guild_id: serenity::model::id::GuildId,
    channel_id: Option<serenity::model::id::ChannelId>,
) -> Result<bool, Error> {
    let lava_client = ctx.data().lavalink.clone();

    let guild_id_num = guild_id.get();

    println!("test0");

    if lava_client.get_player_context(guild_id_num).is_none() {
        let connect_to = match channel_id {
            Some(x) => x,
            None => {
                let user_channel_id = guild_id
                    .to_guild_cached(ctx.cache())
                    .unwrap()
                    .voice_states
                    .get(&ctx.author().id)
                    .and_then(|voice_state| voice_state.channel_id);

                match user_channel_id {
                    Some(channel) => channel,
                    None => {
                        ctx.say("You are not in a voice channel").await?;

                        return Err("You are not in a voice channel".into());
                    }
                }
            }
        };

        println!("test1");

        let manager = songbird::get(ctx.serenity_context())
            .await
            .expect("SongBird dead as hell bru")
            .clone();

        println!("test2");

        let handler = manager.join_gateway(guild_id, connect_to).await;

        println!("test3");

        match handler {
            Ok((connection_info, _)) => {
                let connect_info: ConnectionInfo = ConnectionInfo {
                    endpoint: connection_info.endpoint,
                    token: connection_info.token,
                    session_id: connection_info.session_id,
                    channel_id: Some(ChannelId(connection_info.channel_id.0.get())),
                };

                lava_client
                    .create_player_context(guild_id, connect_info)
                    .await
                    .unwrap();

                println!("test5");

                // ctx.say(format!("Joined {}", connect_to.mention())).await?;

                return Ok(true);
            }
            Err(why) => {
                // ctx.say(format!("Error joining the channel: {}", why))
                //     .await?;
                return Err(why.into());
            }
        }
    }

    Ok(false)
}
