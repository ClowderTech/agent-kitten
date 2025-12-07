// src/commands/leaderboard.rs
use chrono::Utc;
use poise::Context;
use poise::CreateReply;
use poise::serenity_prelude as serenity;
use serenity::builder::CreateEmbed;

use crate::Data;
use crate::Error;

use crate::leveling_helpers::get_users_by_experience_range;

/// Poise slash command: /leaderboard
#[poise::command(slash_command)]
pub async fn leaderboard(ctx: Context<'_, Data, Error>) -> Result<(), Error> {
    // Ensure this was executed in a guild
    let guild_id = match ctx.guild_id() {
        Some(g) => g.to_string(),
        None => {
            ctx.say("You didn't execute this in a server!").await?;
            return Ok(());
        }
    };

    // Access your MongoClient via ctx.data()
    let mongoclient = &ctx.data().mongoclient;

    // Get top 10 users (indices 0..9)
    let top_users = match get_users_by_experience_range(mongoclient, &guild_id, 0, 9).await {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Error fetching leaderboard: {}", e);
            ctx.say("Failed to fetch leaderboard.").await?;
            return Ok(());
        }
    };

    // Build description text
    let mut description = String::from("🏆 **Top 10 Users** 🏆\n\n");
    for user in top_users.iter() {
        description.push_str(&format!(
            "<@{}> - Level: {}, Experience: {}\n",
            user.userid, user.level, user.experience
        ));
    }

    // Create embed
    let embed = CreateEmbed::default()
        .title("Leaderboard")
        .description(description)
        .colour(0x9a2d7d)
        .timestamp(Utc::now());

    // Reply with embed
    ctx.send(CreateReply::default().embed(embed)).await?;

    Ok(())
}

