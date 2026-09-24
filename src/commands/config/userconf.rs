// src/commands/userconf.rs
use poise::serenity_prelude as serenity;
use poise::{Context, CreateReply};
use sea_orm::{ActiveModelTrait, IntoActiveModel};
use serde_json::{self, Value, json};
use serenity::builder::CreateEmbed;

use crate::Data;
use crate::Error;
use crate::config_helpers::{get_nested_key, set_nested_key};
use crate::entity::user::{ActiveModel as UserActiveModel, Entity as User, Model as UserModel};
use sea_orm::ActiveValue::{NotSet, Set};

/// Root slash command with subcommands: set, get, setraw, getraw
#[poise::command(slash_command, subcommands("set", "get", "setraw", "getraw"))]
pub async fn userconf(_ctx: Context<'_, Data, Error>) -> Result<(), Error> {
    // Root is just a grouping for subcommands; do nothing here.
    Ok(())
}

/// Set a configuration option for yourself
#[poise::command(slash_command)]
pub async fn set(
    ctx: Context<'_, Data, Error>,
    #[description = "The configuration key you want to set"] key: String,
    #[description = "The configuration value to set (JSON or raw string)"] value: String,
) -> Result<(), Error> {
    let user_id = ctx.author().id.get();
    let psql_client = &ctx.data().psql_client;

    let content_search: Option<UserModel> = User::find_by_user_id(user_id).one(psql_client).await?;

    let content = match content_search {
        Some(content) => content,
        None => {
            let new_active_model = UserActiveModel {
                id: NotSet,
                user_id: Set(user_id),
                config: Set(json!({})),
            };

            new_active_model.insert(psql_client).await?
        }
    };

    let mut config = content.config.clone();

    // Parse value as JSON; fallback to raw JSON string if not valid JSON
    let parsed_value: Value = serde_json::from_str(&value).unwrap_or(Value::String(value.clone()));

    if let Err(err) = set_nested_key(&mut config, &key, parsed_value) {
        ctx.send(
            CreateReply::default()
                .ephemeral(true)
                .content(format!("Invalid path: {} ({})", key, err)),
        )
        .await?;
        return Ok(());
    }

    let mut content_active = content.into_active_model();

    content_active.config.set_ne(config);

    match content_active.save(psql_client).await {
        Ok(_) => {
            let embed = CreateEmbed::default()
                .title("User Configuration Updated")
                .colour(0x9a2d7d)
                .timestamp(chrono::Utc::now())
                .field("Your Key", key, true)
                .field("New Value", value, false);

            ctx.send(CreateReply::default().ephemeral(true).embed(embed))
                .await?;
        }
        Err(e) => {
            eprintln!("Error updating user configuration: {}", e);
            ctx.send(
                CreateReply::default()
                    .ephemeral(true)
                    .content("There was an error updating your configuration."),
            )
            .await?;
        }
    }

    Ok(())
}

/// View a configuration option for yourself
#[poise::command(slash_command)]
pub async fn get(
    ctx: Context<'_, Data, Error>,
    #[description = "The configuration key you want to get"] key: String,
) -> Result<(), Error> {
    let user_id = ctx.author().id.get();
    let psql_client = &ctx.data().psql_client;

    let content_search: Option<UserModel> = User::find_by_user_id(user_id).one(psql_client).await?;

    let config = content_search
        .map(|u| u.config)
        .unwrap_or_else(|| json!({}));

    match get_nested_key(&config, &key) {
        Some(cfg) => {
            let pretty = serde_json::to_string_pretty(&cfg)?;
            ctx.send(
                CreateReply::default()
                    .ephemeral(true)
                    .content(format!("Value for `{}`:\n```json\n{}\n```", key, pretty)),
            )
            .await?;
        }
        None => {
            ctx.send(
                CreateReply::default()
                    .ephemeral(true)
                    .content(format!("Key `{}` not found.", key)),
            )
            .await?;
        }
    }

    Ok(())
}

/// Set the raw json configuration options for yourself
#[poise::command(slash_command)]
pub async fn setraw(
    ctx: Context<'_, Data, Error>,
    #[description = "The raw configuration value as a JSON string"] value: String,
) -> Result<(), Error> {
    let user_id = ctx.author().id.get();

    let parsed: Value = match serde_json::from_str::<Value>(&value) {
        Ok(cfg) => cfg,
        Err(_) => {
            ctx.send(
                CreateReply::default()
                    .ephemeral(true)
                    .content("Invalid JSON format. Please provide a valid JSON string."),
            )
            .await?;
            return Ok(());
        }
    };

    let psql_client = &ctx.data().psql_client;

    let content_search: Option<UserModel> = User::find_by_user_id(user_id).one(psql_client).await?;

    let content_active = match content_search {
        Some(content) => {
            let mut active = content.into_active_model();
            active.config.set_ne(parsed);
            active
        }
        None => UserActiveModel {
            id: NotSet,
            user_id: Set(user_id),
            config: Set(parsed),
        },
    };

    match content_active.save(psql_client).await {
        Ok(_) => {
            ctx.send(
                CreateReply::default()
                    .ephemeral(true)
                    .content("Raw configuration has been updated successfully."),
            )
            .await?;
        }
        Err(e) => {
            eprintln!("Error updating raw user configuration: {}", e);
            ctx.send(
                CreateReply::default()
                    .ephemeral(true)
                    .content("There was an error updating your raw configuration."),
            )
            .await?;
        }
    }

    Ok(())
}

/// View the raw json configuration options for yourself
#[poise::command(slash_command)]
pub async fn getraw(ctx: Context<'_, Data, Error>) -> Result<(), Error> {
    let user_id = ctx.author().id.get();

    let psql_client = &ctx.data().psql_client;
    let content_search: Option<UserModel> = User::find_by_user_id(user_id).one(psql_client).await?;

    let config = content_search
        .map(|u| u.config)
        .unwrap_or_else(|| json!({}));

    let pretty = serde_json::to_string_pretty(&config)?;
    ctx.send(
        CreateReply::default()
            .ephemeral(true)
            .content(format!("Raw configuration:\n```json\n{}\n```", pretty)),
    )
    .await?;

    Ok(())
}
