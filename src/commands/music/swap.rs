use crate::{Context, Error};

/// Swap between 2 songs in the queue.
#[poise::command(slash_command, prefix_command)]
pub async fn swap(
    ctx: Context<'_>,
    #[description = "Queue item index to swap"] index1: usize,
    #[description = "The other queue item index to swap"] index2: usize,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().unwrap();

    let lava_client = ctx.data().lavalink.clone();

    let Some(player) = lava_client.get_player_context(guild_id.get()) else {
        ctx.say("Join the bot to a voice channel first.").await?;
        return Ok(());
    };

    let queue = player.get_queue();
    let queue_len = queue.get_count().await?;

    if index1 > queue_len || index2 > queue_len {
        ctx.say(format!("Maximum allowed index: {}", queue_len))
            .await?;
        return Ok(());
    } else if index1 == index2 {
        ctx.say("Can't swap between the same indexes").await?;
        return Ok(());
    }

    let track1 = queue.get_track(index1 - 1).await?.unwrap();
    let track2 = queue.get_track(index1 - 2).await?.unwrap();

    queue.swap(index1 - 1, track2)?;
    queue.swap(index2 - 1, track1)?;

    ctx.say("Swapped successfully").await?;

    Ok(())
}

