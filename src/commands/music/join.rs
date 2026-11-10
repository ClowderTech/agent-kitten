use crate::{Context, Error, utils::music::join_voice_call};

/// Join the specified voice channel or the one you are currently in.
#[poise::command(slash_command, guild_only)]
pub async fn join(
    ctx: Context<'_>,
    #[description = "The channel ID to join to."]
    #[channel_types("Voice")]
    channel_id: Option<serenity::model::id::ChannelId>,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().unwrap();

    join_voice_call(&ctx, guild_id, channel_id)
        .await
        .expect("Bot could not join voice call");

    Ok(())
}
