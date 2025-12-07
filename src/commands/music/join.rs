use crate::{Context, Error};

/// Join the specified voice channel or the one you are currently in.
#[poise::command(slash_command, prefix_command)]
pub async fn join(
    ctx: Context<'_>,
    #[description = "The channel ID to join to."]
    #[channel_types("Voice")]
    channel_id: Option<serenity::model::id::ChannelId>,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().unwrap();

    crate::music_helpers::_join(&ctx, guild_id, channel_id).await?;

    Ok(())
}
