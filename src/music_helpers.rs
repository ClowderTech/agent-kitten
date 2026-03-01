use poise::serenity_prelude as serenity;
use serenity::Mentionable;

use crate::{Context, Error};

pub async fn _join(
    ctx: &Context<'_>,
    guild_id: serenity::model::id::GuildId,
    channel_id: Option<serenity::model::id::ChannelId>,
) -> Result<bool, Error> {
    let lava_client = ctx.data().lavalink.clone();

    let guild_id_num = guild_id.get();

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
                        ctx.say("Not in a voice channel").await?;

                        return Err("Not in a voice channel".into());
                    }
                }
            }
        };

        let manager = songbird::get(ctx.serenity_context())
            .await
            .expect("SongBird dead as hell bru")
            .clone();

        let handler = manager.join_gateway(guild_id, connect_to).await;

        match handler {
            Ok((connection_info, _)) => {
                lava_client
                    .create_player_context(guild_id, connection_info)
                    .await?;

                ctx.say(format!("Joined {}", connect_to.mention())).await?;

                return Ok(true);
            }
            Err(why) => {
                ctx.say(format!("Error joining the channel: {}", why))
                    .await?;
                return Err(why.into());
            }
        }
    }

    Ok(false)
}
