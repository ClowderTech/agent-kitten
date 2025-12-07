// src/commands/userconf.rs
use bson::oid::ObjectId;
use mongodb::bson::doc;
use poise::serenity_prelude as serenity;
use poise::{Context, CreateReply};
use serde_json;
use serenity::builder::CreateEmbed;
use std::collections::HashMap;

use crate::Data;
use crate::Error;
use crate::config_helpers::{Config, UserConfig, get_nested_key, set_nested_key};
use crate::mongo_helpers::SetMode;

fn config_to_pretty(cfg: &Config) -> String {
    serde_json::to_string_pretty(cfg).unwrap_or_else(|_| format!("{:?}", cfg))
}

/// Root slash command with subcommands: set, get, setraw, getraw
#[poise::command(
    slash_command,
    subcommands("userconf_set", "userconf_get", "userconf_setraw", "userconf_getraw")
)]
pub async fn userconf(_ctx: Context<'_, Data, Error>) -> Result<(), Error> {
    // Root is just a grouping for subcommands; do nothing here.
    Ok(())
}

#[poise::command(slash_command)]
pub async fn userconf_set(
    ctx: Context<'_, Data, Error>,
    #[description = "The configuration key you want to set"] key: String,
    #[description = "The configuration value to set (JSON or raw string)"] value: String,
) -> Result<(), Error> {
    let user_id = ctx.author().id.to_string();
    let mongoclient = &ctx.data().mongoclient;

    // Fetch or create UserConfig
    let filter = doc! { "userid": user_id.clone() };
    let mut server_data: Vec<UserConfig> = mongoclient.get_data("config", Some(filter)).await?;
    let mut user_conf = if let Some(first) = server_data.get_mut(0) {
        first.clone()
    } else {
        UserConfig {
            _id: ObjectId::new(),
            config: Config::Object(HashMap::new()),
            userid: user_id.clone(),
        }
    };

    // Try parse value as JSON -> Config, else treat as string
    let parsed_cfg: Config = match serde_json::from_str::<Config>(&value) {
        Ok(cfg) => cfg,
        Err(_) => Config::Str(value.clone()),
    };

    // Set nested key (mutates user_conf.config)
    if let Err(err) = set_nested_key(&mut user_conf.config, &key, parsed_cfg) {
        // set_nested_key returns Err(String) on invalid path
        ctx.send(
            CreateReply::default()
                .ephemeral(true)
                .content(format!("Invalid path: {} ({})", key, err)),
        )
        .await?;
        return Ok(());
    }

    // Persist (use Replace upsert semantics). set_data will use _id inside payload if present.
    match mongoclient
        .set_data::<UserConfig>("config", &user_conf, None, SetMode::Replace)
        .await
    {
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

#[poise::command(slash_command)]
pub async fn userconf_get(
    ctx: Context<'_, Data, Error>,
    #[description = "The configuration key you want to get"] key: String,
) -> Result<(), Error> {
    let user_id = ctx.author().id.to_string();
    let mongoclient = &ctx.data().mongoclient;

    let filter = doc! { "userid": user_id.clone() };
    let server_data: Vec<UserConfig> = mongoclient.get_data("config", Some(filter)).await?;
    let user_conf = server_data.first().cloned().unwrap_or(UserConfig {
        _id: ObjectId::new(),
        config: Config::Object(HashMap::new()),
        userid: user_id.clone(),
    });

    match get_nested_key(&user_conf.config, &key) {
        Some(cfg) => {
            let pretty = config_to_pretty(&cfg);
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

#[poise::command(slash_command)]
pub async fn userconf_setraw(
    ctx: Context<'_, Data, Error>,
    #[description = "The raw configuration value as a JSON string"] value: String,
) -> Result<(), Error> {
    let user_id = ctx.author().id.to_string();
    let mongoclient = &ctx.data().mongoclient;

    // parse raw JSON into Config
    let parsed: Config = match serde_json::from_str::<Config>(&value) {
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

    // Fetch or create existing user config
    let filter = doc! { "userid": user_id.clone() };
    let mut server_data: Vec<UserConfig> = mongoclient.get_data("config", Some(filter)).await?;
    let mut user_conf = if let Some(first) = server_data.get_mut(0) {
        first.clone()
    } else {
        UserConfig {
            _id: ObjectId::new(),
            config: Config::Object(HashMap::new()),
            userid: user_id.clone(),
        }
    };

    user_conf.config = parsed;

    match mongoclient
        .set_data::<UserConfig>("config", &user_conf, None, SetMode::Replace)
        .await
    {
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

#[poise::command(slash_command)]
pub async fn userconf_getraw(ctx: Context<'_, Data, Error>) -> Result<(), Error> {
    let user_id = ctx.author().id.to_string();
    let mongoclient = &ctx.data().mongoclient;

    let filter = doc! { "userid": user_id.clone() };
    let server_data: Vec<UserConfig> = mongoclient.get_data("config", Some(filter)).await?;
    let user_conf = server_data.first().cloned().unwrap_or(UserConfig {
        _id: ObjectId::new(),
        config: Config::Object(HashMap::new()),
        userid: user_id.clone(),
    });

    let pretty = config_to_pretty(&user_conf.config);
    ctx.send(
        CreateReply::default()
            .ephemeral(true)
            .content(format!("Raw configuration:\n```json\n{}\n```", pretty)),
    )
    .await?;

    Ok(())
}
