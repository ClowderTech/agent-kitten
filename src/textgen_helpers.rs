use async_openai::{
    Client as OpenAIClient,
    types::{
        mcp::MCPTool,
        responses::{
            CreateResponseArgs, EasyInputMessage, EasyInputMessageArgs, OutputItem,
            OutputMessageContent, Role, Tool,
        },
    },
};

use mongodb::bson::doc;
use serde::{Deserialize, Serialize};

use crate::mongo_helpers::DynError;

pub async fn chat_with_funcs(
    messages: Vec<EasyInputMessage>,
    functions: Vec<MCPTool>,
) -> Result<(Vec<EasyInputMessage>, String), DynError> {
    let mut full_response = messages.clone();

    let tools: Vec<Tool> = functions.into_iter().map(Into::into).collect();

    let request = CreateResponseArgs::default()
        .model("gpt-oss:20b")
        .input(messages)
        .tools(tools)
        .build()?;

    let client = OpenAIClient::new();

    let chat_response = client.responses().create(request).await?;

    let mut final_output = String::new();

    for output in chat_response.output {
        if let OutputItem::Message(message) = output {
            for content in message.content {
                if let OutputMessageContent::OutputText(text) = content {
                    final_output = text.text;
                }
            }
            let message_convert = EasyInputMessageArgs::default()
                .role(Role::Assistant)
                .content(final_output.clone())
                .build()?;
            full_response.push(message_convert);
        }
    }

    Ok((full_response, final_output))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TextgenDoc {
    #[serde(rename = "_id")]
    pub id: bson::oid::ObjectId,
    pub userid: String,
    pub messages: Vec<EasyInputMessage>,
}
