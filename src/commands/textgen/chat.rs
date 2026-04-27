use std::collections::HashMap;

use crate::{
    Context, Error,
    textgen_helpers::{DynError, TextgenDoc, ToolsHandler, chat_with_funcs},
};
use ::serenity::all::{CreateEmbedAuthor, CreateEmbedFooter};
use async_openai::types::responses::{
    FunctionToolArgs, ImageDetail, InputImageContent, InputItem, InputMessage, InputRole,
    InputTextContent, Tool,
};
use base64::{Engine, engine::general_purpose};
use bson::oid::ObjectId;
use futures::FutureExt;
use html_to_markdown_rs::convert;
use mongodb::bson::doc;
use poise::{CreateReply, serenity_prelude as serenity};
use serde_json::{Value, json};
use serenity::builder::CreateEmbed;

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

    let mongoclient = ctx.data().mongoclient.clone();

    let filter = doc! { "userid": ctx.author().id.get().to_string() };
    let content = mongoclient
        .get_data::<TextgenDoc>("textgen", Some(filter.clone()))
        .await?;

    let user_content: TextgenDoc = match content.first() {
        Some(fetched_content) => fetched_content.clone(),
        None => {
            let default_messages: Vec<InputItem> = vec![];
            let default_content = TextgenDoc {
                id: ObjectId::new(),
                userid: ctx.author().id.get().to_string(),
                messages: default_messages,
            };

            default_content
        }
    };

    let mut messages = user_content.messages.clone();

    let mut sendable_user_message = Vec::new();

    sendable_user_message.push(InputTextContent::from(message).into());

    for maybe_file in vec![file1, file2, file3, file4, file5] {
        if let Some(some_file) = maybe_file
            && let Some(some_content_type) = some_file.clone().content_type
        {
            if some_content_type.contains("image") {
                let file = some_file.download().await?;

                let encoding = general_purpose::STANDARD;
                let encoded = encoding.encode(file);

                let final_url = format!("data:{};base64,{}", some_content_type, encoded);

                sendable_user_message.push(
                    InputImageContent {
                        detail: ImageDetail::Auto,
                        image_url: Some(final_url),
                        file_id: None,
                    }
                    .into(),
                );
            } else if some_content_type.contains("text") {
                let file = some_file.download().await?;

                let text = String::from_utf8(file)?;
                let final_text = format!("File {}:\n\n{}", some_file.filename, text);

                sendable_user_message.push(InputTextContent::from(final_text).into());
            }
        }
    }

    let user_message = InputMessage {
        content: sendable_user_message,
        role: InputRole::User,
        status: None,
    };

    messages.push(user_message.into());

    let mut tool_registry: HashMap<String, ToolsHandler> = HashMap::new();

    let search_tool: std::sync::Arc<Tool> = std::sync::Arc::new(Tool::from(FunctionToolArgs::default().name("web_search").description("Use a search engine to find information on the given query.").parameters(json!({"type": "object", "properties": {"query": {"type": "string", "description": "What information to retrieve about on the search engine."}}, "required": ["query"], "additionalProperties": false})).strict(true).build().expect("L rizz")));

    let search_handler = ToolsHandler::new(search_tool, |input: Value| {
        async move {
            let result = search_searx(input).await.expect("L rizz");
            Ok(result)
        }
        .boxed()
    });

    tool_registry.insert("web_search".to_string(), search_handler);

    let scrape_tool: std::sync::Arc<Tool> = std::sync::Arc::new(Tool::from(FunctionToolArgs::default().name("web_scrape").description("Scrapes and generates a markdown representation of a website.").parameters(json!({"type": "object", "properties": {"url": {"type": "string", "description": "The URL to scrape."}}, "required": ["query"], "additionalProperties": false})).strict(true).build().expect("L rizz")));

    let scrape_handler = ToolsHandler::new(scrape_tool, |input: Value| {
        async move {
            let result = web_scrape(input).await.expect("L rizz");
            Ok(result)
        }
        .boxed()
    });

    tool_registry.insert("web_scrape".to_string(), scrape_handler);

    let (new_messages, new_message) = chat_with_funcs(messages, tool_registry).await?;

    let new_user_content = TextgenDoc {
        id: user_content.id,
        userid: user_content.userid.clone(),
        messages: new_messages.clone(),
    };

    mongoclient
        .set_data::<TextgenDoc>(
            "textgen",
            &new_user_content,
            Some(filter.clone()),
            crate::mongo_helpers::SetMode::Replace,
        )
        .await?;

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

pub async fn search_searx(value: Value) -> Result<String, DynError> {
    let query = value["query"].as_str().expect("u suhhhh");

    let query_encoded: String = urlencoding::encode(query).to_string();

    let full_url_query = format!(
        "https://searx.clowdertech.com/search?q={}&format=json",
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

    Ok(final_string)
}

pub async fn web_scrape(value: Value) -> Result<String, DynError> {
    let request_url = value["url"].as_str().expect("u suhhhh");
    let content_url =
        std::env::var("BROWSERLESS_CONTENT_URL").expect("Missing BROWSERLESS_CONTENT_URL");

    let mut json_map = HashMap::new();
    json_map.insert("url", request_url);

    let client = reqwest::Client::new();
    let response = client
        .post(content_url)
        .json(&json_map)
        .send()
        .await?
        .text()
        .await?;

    let result = convert(response.as_str(), None)?;
    let final_result = result.content.unwrap_or_default().trim().to_string();

    Ok(final_result)
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
