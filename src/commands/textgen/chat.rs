use std::{
    collections::{HashMap, HashSet},
    io::Cursor,
};

use crate::{
    Context, Error,
    entity::textgen::{
        ActiveModel as TextgenActiveModel, Entity as Textgen, Model as TextgenModel,
    },
    textgen_helpers::{DynError, ToolsHandler, chat_with_funcs},
};
use ::serenity::all::{CreateEmbedAuthor, CreateEmbedFooter};
use async_openai::types::responses::{
    FunctionToolArgs, InputContent, InputFileArgs, InputImageArgs, InputItem, InputMessageArgs,
    InputRole, InputTextContent, Tool,
};
use base64::{Engine, engine::general_purpose};
use chrono::Utc;
use futures::FutureExt;
use html_to_markdown_rs::{ConversionOptions, convert};
use image::ImageReader;
// use mongodb::bson::doc;
use poise::{CreateReply, serenity_prelude as serenity};
use sea_orm::{
    ActiveModelTrait,
    ActiveValue::{NotSet, Set},
    IntoActiveModel,
};
use serde_json::{Value, json};
use serenity::builder::CreateEmbed;
use symphonia::core::meta::StandardTag::TrackSubtitle;

/// Chat with Agent Kitten using Qwen 3.6
#[poise::command(
    slash_command,
    user_cooldown = 20,
    install_context = "Guild|User",
    interaction_context = "Guild|BotDm|PrivateChannel"
)]
pub async fn chat(
    ctx: Context<'_>,
    #[description = "Message to send to Agent Kitten"] message: String,
    #[description = "File to send to Agent Kitten (currently supports image or text files)"] file1: Option<serenity::Attachment>,
    #[description = "File to send to Agent Kitten (currently supports image or text files)"] file2: Option<serenity::Attachment>,
    #[description = "File to send to Agent Kitten (currently supports image or text files)"] file3: Option<serenity::Attachment>,
    #[description = "File to send to Agent Kitten (currently supports image or text files)"] file4: Option<serenity::Attachment>,
    #[description = "File to send to Agent Kitten (currently supports image or text files)"] file5: Option<serenity::Attachment>,
) -> Result<(), Error> {
    ctx.defer().await?;

    // let mongoclient = ctx.data().mongoclient.clone();

    let psql_client = &ctx.data().psql_client;

    // let filter = doc! { "userid": ctx.author().id.get().to_string() };
    // let content = mongoclient
    //     .get_data::<TextgenDoc>("textgen", Some(filter.clone()))
    //     .await?;

    // let user_content: TextgenDoc = match content.first() {
    //     Some(fetched_content) => fetched_content.clone(),
    //     None => TextgenDoc {
    //         id: ObjectId::new(),
    //         userid: ctx.author().id.get().to_string(),
    //         messages: vec![
    //             ChatCompletionRequestSystemMessageArgs::default()
    //                 .content(textgen_system_instructions)
    //                 .build()?
    //                 .into(),
    //         ],
    //     },
    // };

    let user_id = ctx.author().id.to_string();

    let user_content_search: Option<TextgenModel> = Textgen::find_by_user_id(user_id.clone())
        .one(psql_client)
        .await?;
    let user_content = match user_content_search {
        Some(content) => content,
        None => {
            let new_messages: Vec<InputItem> = vec![];
            let messages_value = serde_json::to_value(new_messages).unwrap();

            let new_active_model = TextgenActiveModel {
                id: NotSet,
                user_id: Set(user_id),
                messages: Set(messages_value),
            };

            new_active_model.insert(psql_client).await?
        }
    };

    let mut messages: Vec<InputItem> =
        serde_json::from_value(user_content.messages.clone()).unwrap();

    let mut sendable_user_message: Vec<InputContent> = Vec::new();

    sendable_user_message.push(InputTextContent::from(message).into());

    for maybe_file in [file1, file2, file3, file4, file5] {
        if let Some(some_file) = maybe_file
            && let Some(some_content_type) = some_file.clone().content_type
        {
            if some_content_type.contains("image") {
                let file = some_file.download().await?;

                let image = ImageReader::new(Cursor::new(file))
                    .with_guessed_format()?
                    .decode()?;
                let mut converted_image: Vec<u8> = Vec::new();
                image.write_to(
                    &mut Cursor::new(&mut converted_image),
                    image::ImageFormat::Jpeg,
                )?;

                let encoding = general_purpose::STANDARD;
                let encoded = encoding.encode(converted_image);

                let final_url = format!("data:{};base64,{}", "image/jpeg", encoded);

                sendable_user_message.push(
                    InputImageArgs::default()
                        .image_url(final_url)
                        .file_id(some_file.id.get().to_string())
                        .build()?
                        .into(),
                );
            } else if some_content_type.contains("text") {
                let file = some_file.download().await?;

                let text = String::from_utf8(file)?;

                sendable_user_message.push(
                    InputFileArgs::default()
                        .filename(some_file.filename)
                        .file_data(text)
                        .file_id(some_file.id.get().to_string())
                        .build()?
                        .into(),
                );
            }
        }
    }

    let user_message = InputMessageArgs::default()
        .content(sendable_user_message)
        .role(InputRole::User)
        .build()?;

    messages.push(user_message.into());

    let mut tool_registry: HashMap<String, ToolsHandler> = HashMap::new();

    let search_tool: std::sync::Arc<Tool> = std::sync::Arc::new(
        Tool::Function(
            FunctionToolArgs::default()
                .name("web_search")
                .description("Use a search engine to find information on the given query.")
                .parameters(json!({"type": "object", "properties": {"query": {"type": "string", "description": "What information to retrieve about on the search engine."}}, "required": ["query"], "additionalProperties": false}))
                .strict(true)
                .build()?
        )
    );

    let search_handler = ToolsHandler::new(search_tool, |input: Value| {
        async move {
            let result = search_searx(input).await.expect("L rizz");
            Ok(result)
        }
        .boxed()
    });

    tool_registry.insert("web_search".to_string(), search_handler);

    let scrape_tool: std::sync::Arc<Tool> = std::sync::Arc::new(
        Tool::Function(
            FunctionToolArgs::default()
                .name("web_scrape")
                .description("Scrapes and generates a full screenshot and/or markdown representation of a website.")
                .parameters(json!({"type": "object", "properties": {"url": {"type": "string", "description": "The URL to scrape."}, "types": {"type": "string", "enum": ["markdown", "screenshot", "both"]}}, "required": ["url", "types"], "additionalProperties": false}))
                .strict(true)
                .build()?
        )
    );

    let scrape_handler = ToolsHandler::new(scrape_tool, |input: Value| {
        async move {
            let result = web_scrape(input).await.expect("L rizz");
            Ok(result)
        }
        .boxed()
    });

    tool_registry.insert("web_scrape".to_string(), scrape_handler);

    let time_tool: std::sync::Arc<Tool> = std::sync::Arc::new(Tool::Function(
        FunctionToolArgs::default()
            .name("current_date_and_time")
            .description("Retrieves the current date and time in UTC.")
            .build()?,
    ));

    let time_handler = ToolsHandler::new(time_tool, |input: Value| {
        async move {
            let result = current_date_and_time(input).await.expect("L rizz");
            Ok(result)
        }
        .boxed()
    });

    tool_registry.insert("current_date_and_time".to_string(), time_handler);

    let image_tool: std::sync::Arc<Tool> = std::sync::Arc::new(
        Tool::Function(
            FunctionToolArgs::default()
                .name("view_image")
                .description("Turns an image url into a viewable image.")
                .parameters(json!({"type": "object", "properties": {"url": {"type": "string", "description": "The url of the image to view."}}, "required": ["url"], "additionalProperties": false}))
                .strict(true)
                .build()?
        )
    );

    let image_handler = ToolsHandler::new(image_tool, |input: Value| {
        async move {
            let result = view_image(input).await.expect("L rizz");
            Ok(result)
        }
        .boxed()
    });

    tool_registry.insert("view_image".to_string(), image_handler);

    let (new_messages, new_message) = chat_with_funcs(messages, tool_registry).await?;

    let mut user_content_active = user_content.into_active_model();

    user_content_active
        .messages
        .set_ne(serde_json::to_value(new_messages)?);

    user_content_active.save(psql_client).await?;

    for chunk in split_text(new_message.as_str(), 4000) {
        let embed = CreateEmbed::default()
            .author(
                CreateEmbedAuthor::new(ctx.http().get_current_user().await?.display_name())
                    .icon_url(
                        ctx.http()
                            .get_current_user()
                            .await?
                            .avatar_url()
                            .unwrap_or_default(),
                    ),
            )
            .color(0x9A2D7D)
            .title("Response")
            .description(chunk)
            .timestamp(chrono::Utc::now())
            .footer(
                CreateEmbedFooter::new(ctx.author().display_name())
                    .icon_url(ctx.author().avatar_url().unwrap_or_default()),
            );

        ctx.send(CreateReply::default().embed(embed)).await?;
    }

    Ok(())
}

pub async fn search_searx(value: Value) -> Result<Vec<InputContent>, DynError> {
    let query = value.get("query").unwrap().as_str().unwrap_or_default();

    let query_encoded: String = urlencoding::encode(query).to_string();

    let content_url = std::env::var("SEARXNG_URL").expect("Missing SEARXNG_URL");
    let full_url_query = format!(
        "{}/search?q={}&format=json",
        content_url,
        query_encoded.as_str()
    );

    let response = reqwest::get(full_url_query)
        .await?
        .json::<serde_json::Value>()
        .await?;

    let mut final_result = "".to_string();
    let mut iteration: u8 = 0;

    for result in response["results"].as_array().expect("L rizz") {
        iteration += 1;
        let result_string = format!(
            "{}. {} - {} - {}\n",
            iteration,
            result["url"].as_str().expect("L rizz"),
            result["title"].as_str().expect("L rizz"),
            result["content"].as_str().expect("L rizz")
        );
        final_result.push_str(result_string.as_str());
    }

    let final_string = final_result.trim().to_string();

    let mut final_sendable: Vec<InputContent> = Vec::new();
    final_sendable.push(InputTextContent::from(final_string).into());

    Ok(final_sendable)
}

pub async fn web_scrape(value: Value) -> Result<Vec<InputContent>, DynError> {
    let request_url = value.get("url").unwrap().as_str().unwrap_or_default();
    let types = value
        .get("types")
        .unwrap()
        .as_str()
        .unwrap_or_default()
        .to_lowercase();

    let mut format_strings = HashSet::new();

    match types.as_str() {
        "screenshot" => format_strings.insert("screenshot"),
        "markdown" => format_strings.insert("markdown"),
        "both" => {
            format_strings.insert("screenshot");
            format_strings.insert("markdown")
        }
        _ => false,
    };

    let content_url = std::env::var("BROWSERLESS_URL").expect("Missing BROWSERLESS_URL");
    let content_token = std::env::var("BROWSERLESS_TOKEN").expect("Missing BROWSERLESS_TOKEN");

    let client = reqwest::Client::new();

    let mut final_sendable: Vec<InputContent> = Vec::new();

    if format_strings.contains("screenshot") {
        let final_url = format!(
            "{}/screenshot?token={}&blockAds=true",
            &content_url, content_token
        );

        let json_map = json!({
            "url": request_url,
            "options": {
                "type": "png",
                "fullPage": true,
            },
        });

        let response = client
            .post(final_url)
            .json(&json_map)
            .send()
            .await?
            .bytes()
            .await?;

        let image = ImageReader::new(Cursor::new(response))
            .with_guessed_format()?
            .decode()?;
        let mut converted_image: Vec<u8> = Vec::new();
        image.write_to(
            &mut Cursor::new(&mut converted_image),
            image::ImageFormat::Jpeg,
        )?;

        let encoding = general_purpose::STANDARD;
        let encoded = encoding.encode(converted_image);

        let final_image = format!("data:{};base64,{}", "image/jpeg", encoded);

        final_sendable.push(
            InputImageArgs::default()
                .image_url(final_image)
                .build()?
                .into(),
        );
    }
    if format_strings.contains("markdown") {
        let final_url = format!(
            "{}/content?token={}&blockAds=true",
            &content_url, content_token
        );

        let json_map = json!({
            "url": request_url,
        });

        let response = client
            .post(final_url)
            .json(&json_map)
            .send()
            .await?
            .text()
            .await?;

        let options = ConversionOptions::builder()
            .compact_tables(true)
            .inline_data_media(html_to_markdown_rs::InlineDataMedia::AltTextOnly)
            .extract_images(true)
            .build();
        let markdown = convert(response.as_str(), options)
            .unwrap_or_default()
            .content
            .unwrap_or_default();

        final_sendable.push(InputTextContent::from(markdown).into());
    }

    Ok(final_sendable)
}

pub async fn current_date_and_time(_value: Value) -> Result<Vec<InputContent>, DynError> {
    let current_utc = Utc::now();

    let utc_string = format!("{}", current_utc);

    let mut final_sendable: Vec<InputContent> = Vec::new();
    final_sendable.push(InputTextContent::from(utc_string).into());

    Ok(final_sendable)
}

pub async fn view_image(value: Value) -> Result<Vec<InputContent>, DynError> {
    let request_url = value.get("url").unwrap().as_str().unwrap_or_default();

    let response = reqwest::get(request_url).await?.bytes().await?;

    let image = ImageReader::new(Cursor::new(response))
        .with_guessed_format()?
        .decode()?;
    let mut converted_image: Vec<u8> = Vec::new();
    image.write_to(
        &mut Cursor::new(&mut converted_image),
        image::ImageFormat::Jpeg,
    )?;

    let encoding = general_purpose::STANDARD;
    let encoded = encoding.encode(converted_image);

    let final_image = format!("data:{};base64,{}", "image/jpeg", encoded);

    let mut final_sendable: Vec<InputContent> = Vec::new();

    final_sendable.push(
        InputImageArgs::default()
            .image_url(final_image)
            .build()?
            .into(),
    );

    Ok(final_sendable)
}

pub fn split_text(text: &str, max_length: usize) -> Vec<String> {
    // mimic /\r?\n/ by splitting on '\n' and trimming a possible trailing '\r'
    let lines: Vec<&str> = text.split('\n').map(|l| l.trim_end_matches('\r')).collect();

    let mut chunks: Vec<String> = Vec::new();
    let mut current_chunk = String::new();
    let mut code_block_open = false;

    // helper to push current_chunk into chunks following the original logic
    fn push_chunk(chunks: &mut Vec<String>, current_chunk: &mut String, code_block_open: bool) {
        if code_block_open {
            current_chunk.push_str("```\n");
            chunks.push(current_chunk.trim().to_string());
            *current_chunk = "```\n".to_string();
        } else {
            chunks.push(current_chunk.trim().to_string());
            current_chunk.clear();
        }
    }

    for line in lines {
        // toggle code block state when a line starts with ```
        if line.trim().starts_with("```") {
            code_block_open = !code_block_open;
        }

        let line_len = line.chars().count();
        let current_len = current_chunk.chars().count();

        if current_len + line_len + 1 > max_length {
            // The line itself is longer than max_length (needs slicing).
            if line_len + 1 > max_length {
                let mut remaining = line.to_string();
                while !remaining.is_empty() {
                    let cur_len = current_chunk.chars().count();
                    // space left for characters from the long line (reserve 1 for newline)
                    let space_left = if max_length > cur_len + 1 {
                        max_length - cur_len - 1
                    } else {
                        0
                    };

                    if space_left == 0 {
                        // no room; push current chunk and continue
                        push_chunk(&mut chunks, &mut current_chunk, code_block_open);
                        continue;
                    }

                    // take up to `space_left` characters from remaining
                    let segment: String = remaining.chars().take(space_left).collect();
                    current_chunk.push_str(&segment);

                    // drop those taken chars from remaining
                    remaining = remaining.chars().skip(space_left).collect();

                    if !remaining.is_empty() {
                        // more remains -> push chunk and start a new one
                        push_chunk(&mut chunks, &mut current_chunk, code_block_open);
                    }
                }
                // after finishing slicing this long line, add the newline
                current_chunk.push('\n');
            } else {
                // line fits by itself but not into current chunk -> push and append line
                push_chunk(&mut chunks, &mut current_chunk, code_block_open);
                current_chunk.push_str(line);
                current_chunk.push('\n');
            }
        } else {
            // fits in current chunk
            current_chunk.push_str(line);
            current_chunk.push('\n');
        }
    }

    // Finalize: if anything remains in current_chunk, close code block if needed, and push
    if !current_chunk.trim().is_empty() {
        if code_block_open {
            current_chunk.push_str("```");
        }
        chunks.push(current_chunk.trim().to_string());
    }

    chunks
}
