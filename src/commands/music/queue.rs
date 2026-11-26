use futures::StreamExt;
use poise::CreateReply;
use serenity::builder::{CreateEmbed, CreateEmbedAuthor, CreateEmbedFooter};

use crate::{Context, Error};

/// Add a song to the queue
#[poise::command(slash_command, guild_only)]
pub async fn queue(ctx: Context<'_>) -> Result<(), Error> {
    let guild_id = ctx.guild_id().unwrap();

    let lava_client = ctx.data().lavalink.clone();

    let Some(player) = lava_client.get_player_context(guild_id.get()) else {
        ctx.say("Join the bot to a voice channel first.").await?;
        return Ok(());
    };

    let queue = player.get_queue();
    let player_data = player.get_player().await?;

    let max = queue.get_count().await?.min(9);
    let maxxed_out = queue.get_count().await? < max;

    let mut embed = CreateEmbed::default()
        .author(
            CreateEmbedAuthor::new(ctx.http().get_current_user().await?.display_name()).icon_url(
                ctx.http()
                    .get_current_user()
                    .await?
                    .avatar_url()
                    .unwrap_or_default(),
            ),
        )
        .timestamp(chrono::Utc::now())
        .footer(
            CreateEmbedFooter::new(ctx.author().display_name())
                .icon_url(ctx.author().avatar_url().unwrap_or_default()),
        )
        .title("Queue")
        .color(0x9A2D7D);

    let queue_message = queue
        .enumerate()
        .take_while(|(idx, _)| std::future::ready(*idx < max))
        .map(|(idx, x)| {
            if let Some(uri) = &x.track.info.uri {
                format!(
                    "{} -> [{} - {}](<{}>) | Requested by <@!{}>",
                    idx + 1,
                    x.track.info.author,
                    x.track.info.title,
                    uri,
                    x.track.user_data.unwrap()["requester_id"]
                )
            } else {
                format!(
                    "{} -> {} - {} | Requested by <@!{}",
                    idx + 1,
                    x.track.info.author,
                    x.track.info.title,
                    x.track.user_data.unwrap()["requester_id"]
                )
            }
        })
        .collect::<Vec<_>>()
        .await
        .join("\n");

    let final_queue_message;

    if maxxed_out {
        final_queue_message = format!("{}\n...", queue_message);
    } else {
        final_queue_message = queue_message;
    }

    let now_playing_message = if let Some(track) = player_data.track {
        let time_s = player_data.state.position / 1000 % 60;
        let time_m = player_data.state.position / 1000 / 60;
        let time = format!("{:02}:{:02}", time_m, time_s);

        if let Some(track_artwork) = &track.info.artwork_url {
            embed = embed.thumbnail(track_artwork);
        }

        if let Some(uri) = &track.info.uri {
            format!(
                "Now playing: [{} - {}](<{}>) | {}, Requested by <@!{}>",
                track.info.author,
                track.info.title,
                uri,
                time,
                track.user_data.unwrap()["requester_id"]
            )
        } else {
            format!(
                "Now playing: {} - {} | {}, Requested by <@!{}>",
                track.info.author,
                track.info.title,
                time,
                track.user_data.unwrap()["requester_id"]
            )
        }
    } else {
        "Now playing: nothing".to_string()
    };

    embed = embed.description(format!(
        "{}\n\n{}",
        now_playing_message, final_queue_message
    ));

    ctx.send(CreateReply::default().embed(embed)).await?;

    Ok(())
}
