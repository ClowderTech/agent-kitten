use crate::{
    Context, Error,
    textgen_helpers::{TextgenDoc, chat_with_funcs},
};
use ::serenity::all::{CreateEmbedAuthor, CreateEmbedFooter};
use async_openai::types::{
    // mcp::{MCPToolAllowedTools, MCPToolArgs},
    responses::{EasyInputMessage, EasyInputMessageArgs, Role},
};
use bson::oid::ObjectId;
use mongodb::bson::doc;
use poise::{CreateReply, serenity_prelude as serenity};
use serenity::builder::CreateEmbed;

#[poise::command(slash_command, prefix_command)]
pub async fn chat(ctx: Context<'_>, message: String) -> Result<(), Error> {
    ctx.defer().await?;

    let mongoclient = ctx.data().mongoclient.clone();

    let filter = doc! { "userid": ctx.author().id.get().to_string() };
    let content = mongoclient
        .get_data::<TextgenDoc>("textgen", Some(filter.clone()))
        .await?;

    let default_messages: Vec<EasyInputMessage> = vec![EasyInputMessageArgs::default().role(Role::System).content("You are Agent Kitten, a helpful AI powered discord bot made by the ClowderTech LLC. You are here to help people with their problems or to interact with the person to help them feel better. Your own website is https://agentkitten.com/. Please make sure to use your tools and function calls whenever useful. Also remember to follow discord's markdown syntax which is somewhat limited. You should ask questions to the user if it is needed to respond to them reasonably.").build()?];
    let default_user_content = TextgenDoc {
        id: ObjectId::new(),
        userid: ctx.author().id.get().to_string(),
        messages: default_messages,
    };
    let user_content = content.first().unwrap_or(&default_user_content);

    let mut messages = user_content.messages.clone();

    let user_message = EasyInputMessageArgs::default()
        .role(Role::User)
        .content(message)
        .build()?;
    messages.push(user_message);

    //let search_mcp = MCPToolArgs::default()
    //    .server_label("searxng")
    //    .server_url("")
    //    .allowed_tools(MCPToolAllowedTools::from(vec!["*"]))
    //    .build()?;

    let (new_messages, response) = chat_with_funcs(messages, vec![]).await?;

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

    for chunk in split_text(response.as_str(), 4000) {
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
