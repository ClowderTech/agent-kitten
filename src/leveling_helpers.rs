// src/leveling.rs
use crate::config_helpers::{Config, UserConfig, get_nested_key};
use crate::mongo_helpers::{DynError, MongoClient, SetMode};
use bson::oid::ObjectId;
use mongodb::bson::doc;
use serde::{Deserialize, Serialize};

/// Simple struct representing a user's leveling document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserLeveling {
    pub _id: ObjectId,
    pub userid: String,
    pub experience: i64,
    pub level: i64,
    pub serverid: String,
}

/// Calculate experience gain (mirror of the TS function).
/// Default multiplier = 1.0
pub fn calculate_exp_gain(multiplier: f64) -> i64 {
    // Math equivalent: Math.floor((Math.abs(Math.sqrt(Math.random() * 100) - 10) + 1) * multiplier)
    let r: f64 = rand::random_range(0.0..100.0);
    let val = ((r.sqrt() - 10.0).abs() + 1.0) * multiplier;
    val.floor() as i64
}

/// Calculate experience required to reach next level (mirror of TS math)
pub fn calculate_exp_to_next_level(current_level: i64, current_experience: i64) -> i64 {
    let a: i64 = 2;
    let b: i64 = 50;
    let c: i64 = 100;

    // expNeeded = a * (currentLevel + 1)^2 + b * currentLevel + c
    let next_level = current_level + 1;
    let exp_needed = a * next_level * next_level + b * current_level + c;
    // floor(expNeeded / 10) - currentExperience
    (exp_needed / 10) - current_experience
}

/// Get a member's experience (returns 0 if not found)
pub async fn get_member_experience(
    client: &MongoClient,
    member_id: &str,
    server_id: &str,
) -> Result<i64, DynError> {
    let filter = doc! { "userid": member_id, "serverid": server_id };
    let users: Vec<UserLeveling> = client.get_data("leveling", Some(filter)).await?;
    Ok(users.first().map(|u| u.experience).unwrap_or(0))
}

/// Get a member's level (returns 0 if not found)
pub async fn get_member_level(
    client: &MongoClient,
    member_id: &str,
    server_id: &str,
) -> Result<i64, DynError> {
    let filter = doc! { "userid": member_id, "serverid": server_id };
    let users: Vec<UserLeveling> = client.get_data("leveling", Some(filter)).await?;
    Ok(users.first().map(|u| u.level).unwrap_or(0))
}

/// Update member stats (insert or upsert)
pub async fn update_member_stats(
    client: &MongoClient,
    member_id: &str,
    server_id: &str,
    new_experience: i64,
    new_level: i64,
) -> Result<(), DynError> {
    // See if user exists
    let filter = doc! { "userid": member_id, "serverid": server_id };
    let users: Vec<UserLeveling> = client.get_data("leveling", Some(filter.clone())).await?;

    if let Some(existing) = users.first() {
        // use existing _id and upsert (replace semantics)
        let user_doc = UserLeveling {
            userid: member_id.to_string(),
            serverid: server_id.to_string(),
            experience: new_experience,
            level: new_level,
            _id: existing._id,
        };

        // set_data expects the typed data and an optional id filter.
        // Provide {"_id": existing._id}
        client
            .set_data::<UserLeveling>("leveling", &user_doc, Some(filter), SetMode::Replace)
            .await?;
    } else {
        // Insert new document
        let new_id = ObjectId::new();
        let user_doc = UserLeveling {
            userid: member_id.to_string(),
            serverid: server_id.to_string(),
            experience: new_experience,
            level: new_level,
            _id: new_id,
        };
        // No id_filter -> will insert
        client
            .set_data::<UserLeveling>("leveling", &user_doc, None, SetMode::Replace)
            .await?;
    }

    Ok(())
}

/// Return users ranked by level desc then experience desc, slicing indices [x..=y].
/// If x < 0 or y < x -> returns Err.
pub async fn get_users_by_experience_range(
    client: &MongoClient,
    server_id: &str,
    x: usize,
    y: usize,
) -> Result<Vec<UserLeveling>, DynError> {
    if y < x {
        return Err(Box::<dyn std::error::Error + Send + Sync>::from(
            "Invalid indices: x must be <= y",
        ));
    }

    let filter = doc! { "serverid": server_id };
    let mut users: Vec<UserLeveling> = client.get_data("leveling", Some(filter)).await?;

    // sort by level desc, then experience desc
    users.sort_by(|a, b| {
        b.level
            .cmp(&a.level)
            .then_with(|| b.experience.cmp(&a.experience))
    });

    if x >= users.len() {
        return Ok(Vec::new());
    }
    let end = std::cmp::min(y + 1, users.len());
    Ok(users[x..end].to_vec())
}

/// The "pretty" experience gain function:
/// - computes exp gain
/// - updates DB (and resets experience to 0 if leveled up)
/// - if leveled up and user configuration allows it, returns an `EmbedData` to be sent as a DM
///
/// `channel_url` is used to include a link in the description like your TS code did.
/// If you want the function to send Discord messages directly, adapt it to your Discord client.
pub async fn pretty_exp_gain(
    client: &MongoClient,
    user_id: &str,
    guild_id: &str,
    channel_url: &str,
    multiplier: f64,
) -> Result<Option<serenity::builder::CreateEmbed>, DynError> {
    let current_experience = get_member_experience(client, user_id, guild_id).await?;
    let current_level = get_member_level(client, user_id, guild_id).await?;
    let exp_gain = calculate_exp_gain(multiplier);
    let new_experience = current_experience + exp_gain;
    let exp_to_next = calculate_exp_to_next_level(current_level, new_experience);

    let new_level = if exp_to_next <= 0 {
        current_level + 1
    } else {
        current_level
    };

    // Update DB (reset experience to 0 if leveled up)
    let experience_to_store = if new_level > current_level {
        0
    } else {
        new_experience
    };

    update_member_stats(client, user_id, guild_id, experience_to_store, new_level).await?;

    // If leveled up: determine whether user wants messages
    if new_level > current_level {
        // get user config
        let conf_filter = doc! { "userid": user_id };
        let server_data: Vec<UserConfig> = client.get_data("config", Some(conf_filter)).await?;

        // default to true if not present
        let mut level_up_messaging_enabled: bool = true;

        if let Some(first) = server_data.first() {
            // get_nested_key returns Option<Config>
            match get_nested_key(&first.config, "leveling.levelupmessaging") {
                Some(Config::Bool(boolean)) => level_up_messaging_enabled = boolean,
                Some(_) => level_up_messaging_enabled = true,
                None => level_up_messaging_enabled = true,
            }
        }

        if level_up_messaging_enabled {
            // Build an embed-like payload for the caller to send
            let title = "🎉 Congratulations! 🎉".to_string();

            // In TS you included a slash-command hint with a command ID lookup.
            // That logic is Discord-client-specific; here we give a generic hint.
            let description = format!(
                "<@!{}>, you leveled up to level {} in {}! 🎊\n\n-# If you don't want these messages, run `/userconf set` and set `leveling.levelupmessaging` to `false`",
                user_id, new_level, channel_url
            );

            let embed = serenity::builder::CreateEmbed::default()
                .title(title)
                .description(description);

            return Ok(Some(embed));
        }
    }

    Ok(None)
}
