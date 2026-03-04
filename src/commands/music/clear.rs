use crate::{Context, Error};

/// Clear the current queue.
#[poise::command(slash_command, guild_only)]
pub async fn clear(ctx: Context<'_>) -> Result<(), Error> {
    let guild_id = ctx.guild_id().unwrap();

    let lava_client = ctx.data().lavalink.clone();

    let Some(player) = lava_client.get_player_context(guild_id.get()) else {
        ctx.say("Join the bot to a voice channel first.").await?;
        return Ok(());
    };

    player.get_queue().clear()?;

    ctx.say("Queue cleared successfully").await?;

    Ok(())
}
