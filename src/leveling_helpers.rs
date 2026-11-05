use crate::Error;
use crate::config_helpers::get_nested_key;
use crate::entity::leveling::{
    ActiveModel as LevelingActiveModel, Entity as Leveling, Model as LevelingModel,
};
use crate::entity::user::{ActiveModel as UserActiveModel, Entity as User, Model as UserModel};
use sea_orm::ActiveValue::{NotSet, Set};
use sea_orm::{ActiveModelTrait, DatabaseConnection, IntoActiveModel};
use serde_json::{Value, json};

/// Calculate experience gain (mirror of the TS function).
/// Default multiplier = 1.0
pub fn calculate_exp_gain(multiplier: f64) -> i32 {
    // Math equivalent: Math.floor((Math.abs(Math.sqrt(Math.random() * 100) - 10) + 1) * multiplier)
    let r: f64 = rand::random_range(0.0..100.0);
    let val = ((r.sqrt() - 10.0).abs() + 1.0) * multiplier;
    val.floor() as i32
}

/// Calculate experience required to reach next level (mirror of TS math)
pub fn calculate_exp_to_next_level(current_level: i32, current_experience: i32) -> i32 {
    let a: i32 = 2;
    let b: i32 = 50;
    let c: i32 = 100;

    // expNeeded = a * (currentLevel + 1)^2 + b * currentLevel + c
    let next_level = current_level + 1;
    let exp_needed = a * next_level * next_level + b * current_level + c;
    // floor(expNeeded / 10) - currentExperience
    (exp_needed / 10) - current_experience
}

/// The "pretty" experience gain function:
/// - computes exp gain
/// - updates DB (and resets experience to 0 if leveled up)
/// - if leveled up and user configuration allows it, returns an `EmbedData` to be sent as a DM
///
/// `channel_url` is used to include a link in the description like your TS code did.
/// If you want the function to send Discord messages directly, adapt it to your Discord client.
pub async fn pretty_exp_gain(
    psql_client: &DatabaseConnection,
    user_id: String,
    guild_id: String,
    channel_url: &str,
    multiplier: f64,
) -> Result<Option<serenity::builder::CreateEmbed>, Error> {
    let user_content_search: Option<LevelingModel> =
        Leveling::find_by_pair((user_id.clone(), guild_id.clone()))
            .one(psql_client)
            .await?;

    let user_content = match user_content_search {
        Some(content) => content,
        None => {
            let new_active_model = LevelingActiveModel {
                id: NotSet,
                user_id: Set(user_id.clone()),
                server_id: Set(guild_id.clone()),
                level: Set(0),
                experience: Set(0),
            };

            new_active_model.insert(psql_client).await?
        }
    };

    let current_experience = user_content.experience;
    let current_level = user_content.level;
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

    let mut active_user_model = user_content.into_active_model();
    active_user_model.level.set_ne(new_level);
    active_user_model.experience.set_ne(experience_to_store);
    active_user_model.save(psql_client).await?;

    // If leveled up: determine whether user wants messages
    if new_level > current_level {
        let content_search: Option<UserModel> = User::find_by_user_id(user_id.clone())
            .one(psql_client)
            .await?;

        let content = match content_search {
            Some(content) => content,
            None => {
                let new_active_model = UserActiveModel {
                    id: NotSet,
                    user_id: Set(user_id.clone()),
                    config: Set(json!({})),
                };

                new_active_model.insert(psql_client).await?
            }
        };

        // default to true if not present

        // get_nested_key returns Option<Config>
        let level_up_messaging_enabled: bool =
            match get_nested_key(&content.config, "leveling.levelupmessaging") {
                Some(Value::Bool(boolean)) => boolean,
                Some(_) => true,
                None => true,
            };

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
