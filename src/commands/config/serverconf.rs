// src/commands/serverconf.rs
use bson::oid::ObjectId;
use mongodb::bson::doc;
use poise::serenity_prelude as serenity;
use poise::{Context, CreateReply};
use serde_json;
use serenity::builder::CreateEmbed;
use std::collections::HashMap;

use crate::Data;
use crate::Error;
use crate::config_helpers::{Config, ServerConfig, get_nested_key, set_nested_key};
use crate::mongo_helpers::SetMode;

fn config_to_pretty(cfg: &Config) -> String {
    serde_json::to_string_pretty(cfg).unwrap_or_else(|_| format!("{:?}", cfg))
}

/// Root slash command with subcommands: set, get, setraw, getraw
#[poise::command(
    slash_command,
    subcommands(
        "set",
        "get",
        "setraw",
        "getraw"
    ),
    required_permissions = "ADMINISTRATOR",
    default_member_permissions = "ADMINISTRATOR",
    guild_only
)]
pub async fn serverconf(_ctx: Context<'_, Data, Error>) -> Result<(), Error> {
    Ok(())
}

#[poise::command(slash_command)]
pub async fn set(
    ctx: Context<'_, Data, Error>,
    #[description = "The configuration key you want to set"] key: String,
    #[description = "The configuration value to set (JSON or raw string)"] value: String,
) -> Result<(), Error> {
    // Ensure this command is run in a guild
    let guild_id = match ctx.guild_id() {
        Some(g) => g.to_string(),
        None => {
            ctx.say("This was not sent in a server.").await?;
            return Ok(());
        }
    };

    let mongoclient = &ctx.data().mongoclient;

    // Fetch or create ServerConfig
    let filter = doc! { "serverid": guild_id.clone() };
    let mut server_data: Vec<ServerConfig> = mongoclient.get_data("config", Some(filter)).await?;
    let mut server_conf = if let Some(first) = server_data.get_mut(0) {
        first.clone()
    } else {
        ServerConfig {
            _id: ObjectId::new(),
            config: Config::Object(HashMap::new()),
            serverid: guild_id.clone(),
        }
    };

    // Try parse JSON value into Config, else treat as string
    let parsed_cfg: Config = match serde_json::from_str::<Config>(&value) {
        Ok(cfg) => cfg,
        Err(_) => Config::Str(value.clone()),
    };

    if let Err(err) = set_nested_key(&mut server_conf.config, &key, parsed_cfg) {
        ctx.send(CreateReply::default().content(format!("Invalid path: {} ({})", key, err)))
            .await?;
        return Ok(());
    }

    match mongoclient
        .set_data::<ServerConfig>("config", &server_conf, None, SetMode::Replace)
        .await
    {
        Ok(_) => {
            let embed = CreateEmbed::default()
                .title("Server Configuration Updated")
                .colour(0x9a2d7d)
                .timestamp(chrono::Utc::now())
                .field("Your Key", key, true)
                .field("New Value", value, false);

            ctx.send(CreateReply::default().embed(embed)).await?;
        }
        Err(e) => {
            eprintln!("Error updating server configuration: {}", e);
            ctx.send(
                CreateReply::default().content("There was an error updating your configuration."),
            )
            .await?;
        }
    }

    Ok(())
}

#[poise::command(slash_command)]
pub async fn get(
    ctx: Context<'_, Data, Error>,
    #[description = "The configuration key you want to get"] key: String,
) -> Result<(), Error> {
    let guild_id = match ctx.guild_id() {
        Some(g) => g.to_string(),
        None => {
            ctx.say("This was not sent in a server.").await?;
            return Ok(());
        }
    };

    let mongoclient = &ctx.data().mongoclient;
    let filter = doc! { "serverid": guild_id.clone() };
    let server_data: Vec<ServerConfig> = mongoclient.get_data("config", Some(filter)).await?;
    let server_conf = server_data.first().cloned().unwrap_or(ServerConfig {
        _id: ObjectId::new(),
        config: Config::Object(HashMap::new()),
        serverid: guild_id.clone(),
    });

    match get_nested_key(&server_conf.config, &key) {
        Some(cfg) => {
            let pretty = config_to_pretty(&cfg);
            ctx.send(
                CreateReply::default()
                    .content(format!("Value for `{}`:\n```json\n{}\n```", key, pretty)),
            )
            .await?;
        }
        None => {
            ctx.send(CreateReply::default().content(format!("Key `{}` not found.", key)))
                .await?;
        }
    }

    Ok(())
}

#[poise::command(slash_command)]
pub async fn setraw(
    ctx: Context<'_, Data, Error>,
    #[description = "The raw configuration value as a JSON string"] value: String,
) -> Result<(), Error> {
    let guild_id = match ctx.guild_id() {
        Some(g) => g.to_string(),
        None => {
            ctx.say("This was not sent in a server.").await?;
            return Ok(());
        }
    };

    let mongoclient = &ctx.data().mongoclient;

    let parsed: Config = match serde_json::from_str::<Config>(&value) {
        Ok(cfg) => cfg,
        Err(_) => {
            ctx.send(
                CreateReply::default()
                    .content("Invalid JSON format. Please provide a valid JSON string."),
            )
            .await?;
            return Ok(());
        }
    };

    let filter = doc! { "serverid": guild_id.clone() };
    let mut server_data: Vec<ServerConfig> = mongoclient.get_data("config", Some(filter)).await?;
    let mut server_conf = if let Some(first) = server_data.get_mut(0) {
        first.clone()
    } else {
        ServerConfig {
            _id: ObjectId::new(),
            config: Config::Object(HashMap::new()),
            serverid: guild_id.clone(),
        }
    };

    server_conf.config = parsed;

    match mongoclient
        .set_data::<ServerConfig>("config", &server_conf, None, SetMode::Replace)
        .await
    {
        Ok(_) => {
            ctx.send(
                CreateReply::default().content("Raw configuration has been updated successfully."),
            )
            .await?;
        }
        Err(e) => {
            eprintln!("Error updating raw server configuration: {}", e);
            ctx.send(
                CreateReply::default()
                    .content("There was an error updating your raw configuration."),
            )
            .await?;
        }
    }

    Ok(())
}

#[poise::command(slash_command)]
pub async fn getraw(ctx: Context<'_, Data, Error>) -> Result<(), Error> {
    let guild_id = match ctx.guild_id() {
        Some(g) => g.to_string(),
        None => {
            ctx.say("This was not sent in a server.").await?;
            return Ok(());
        }
    };

    let mongoclient = &ctx.data().mongoclient;
    let filter = doc! { "serverid": guild_id.clone() };
    let server_data: Vec<ServerConfig> = mongoclient.get_data("config", Some(filter)).await?;
    let server_conf = server_data.first().cloned().unwrap_or(ServerConfig {
        _id: ObjectId::new(),
        config: Config::Object(HashMap::new()),
        serverid: guild_id.clone(),
    });

    let pretty = config_to_pretty(&server_conf.config);
    ctx.send(
        CreateReply::default().content(format!("Raw configuration:\n```json\n{}\n```", pretty)),
    )
    .await?;

    Ok(())
}
