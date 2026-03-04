// src/commands/level.rs
use chrono::Utc;
use poise::Context;
use poise::CreateReply;
use poise::serenity_prelude as serenity;
use serenity::builder::CreateEmbed;

use crate::Data;
use crate::Error;

use crate::leveling_helpers::{
    calculate_exp_to_next_level, get_member_experience, get_member_level,
};

/// Check a user's level in the server
#[poise::command(slash_command, guild_only)]
pub async fn level(
    ctx: Context<'_, Data, Error>,
    #[description = "Select a user to check their level"] user: Option<serenity::User>,
) -> Result<(), Error> {
    // Use the provided user or fallback to the command invoker
    let target = user.as_ref().unwrap_or_else(|| ctx.author());

    // Ensure this was executed in a guild
    let guild_id = match ctx.guild_id() {
        Some(g) => g.to_string(),
        None => {
            ctx.say("You didn't execute this in a server!").await?;
            return Ok(());
        }
    };

    let user_id = target.id.to_string();

    // Access your MongoClient via ctx.data()
    let mongoclient = &ctx.data().mongoclient;

    // Fetch experience and level using your helpers
    // These return Result<i64, DynError> in the helper module; adapt if your signatures differ
    let experience = match get_member_experience(mongoclient, &user_id, &guild_id).await {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Error fetching member experience: {}", e);
            ctx.say("Failed to fetch member experience.").await?;
            return Ok(());
        }
    };

    let level = match get_member_level(mongoclient, &user_id, &guild_id).await {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Error fetching member level: {}", e);
            ctx.say("Failed to fetch member level.").await?;
            return Ok(());
        }
    };

    // Compute exp needed for next level
    let exp_needed = calculate_exp_to_next_level(level, experience);

    let embed = CreateEmbed::default()
        .title("Level Information")
        .description(format!("Here is <@{}>'s level info!", user_id))
        .colour(0x9a2d7d)
        .field("Current Level", level.to_string(), true)
        .field("Current Experience", experience.to_string(), true)
        .field("EXP Needed for Next Level", exp_needed.to_string(), true)
        .timestamp(Utc::now());
    // Build and send an embed response
    ctx.send(CreateReply::default().embed(embed)).await?;

    Ok(())
}
