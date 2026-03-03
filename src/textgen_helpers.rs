use async_openai::{
    Client as OpenAIClient,
    types::chat::{
        ChatCompletionMessageToolCalls, ChatCompletionRequestMessage,
        ChatCompletionRequestToolMessageArgs, ChatCompletionTool, ChatCompletionTools,
        CreateChatCompletionRequest, CreateChatCompletionResponse,
    },
};
use futures::future::BoxFuture;
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};

use mongodb::bson::doc;
use serde::{Deserialize, Serialize};

pub struct ToolsHandler {
    tools: Arc<ChatCompletionTool>,
    handler: Box<dyn Fn(Value) -> BoxFuture<'static, Result<String, DynError>> + Send + Sync>,
}

impl ToolsHandler {
    pub fn new<F>(tools: Arc<ChatCompletionTool>, handler: F) -> Self
    where
        F: Fn(Value) -> BoxFuture<'static, Result<String, DynError>> + Send + Sync + 'static,
    {
        Self {
            tools,
            handler: Box::new(handler),
        }
    }

    fn execute(&self, args: Value) -> BoxFuture<'static, Result<String, DynError>> {
        (self.handler)(args)
    }

    fn tools(&self) -> Arc<ChatCompletionTool> {
        Arc::clone(&self.tools)
    }
}

// Standard error alias
pub type DynError = Box<dyn std::error::Error + Send + Sync>;

pub async fn chat_with_funcs(
    messages: Vec<ChatCompletionRequestMessage>,
    functions: HashMap<String, ToolsHandler>,
) -> Result<
    (
        Vec<ChatCompletionRequestMessage>,
        CreateChatCompletionResponse,
    ),
    DynError,
> {
    let mut full_response = messages.clone();

    let mut tools: Vec<ChatCompletionTools> = Vec::new();

    for tools_handler in functions.values() {
        let tool = (*tools_handler.tools()).clone();
        tools.push(ChatCompletionTools::Function(tool));
    }

    let request = CreateChatCompletionRequest {
        model: "qwen3.5:35b".to_string(),
        messages: full_response.clone(),
        tools: Some(tools),
        ..Default::default()
    };

    let client = OpenAIClient::new();

    let chat_response = client.chat().create(request).await?;
    let mut response: CreateChatCompletionResponse = chat_response.clone();
    let serialized = serde_json::to_string(&chat_response.choices[0].message).unwrap();
    let deserialized: ChatCompletionRequestMessage = serde_json::from_str(&serialized).unwrap();
    full_response.push(deserialized);

    while let Some(tool_calls) = response
        .choices
        .first()
        .ok_or("No choices")?
        .message
        .tool_calls
        .clone()
    {
        for tool_call_enum in tool_calls {
            if let ChatCompletionMessageToolCalls::Function(tool_call) = tool_call_enum {
                let func = &functions[&tool_call.function.name];
                let func_args: serde_json::Value = tool_call.function.arguments.parse().unwrap();
                let tool_call_response: String = func.execute(func_args).await?;
                let tool_message = ChatCompletionRequestToolMessageArgs::default()
                    .content(tool_call_response)
                    .tool_call_id(tool_call.id.clone())
                    .build()
                    .unwrap()
                    .into();
                full_response.push(tool_message);
            }
        }

        let request = CreateChatCompletionRequest {
            model: "gpt-oss:20b".to_string(),
            messages: full_response.clone(),
            ..Default::default()
        };

        let chat_response = client.chat().create(request).await?;
        response = chat_response.clone();
        let serialized = serde_json::to_string(&chat_response.choices[0].message).unwrap();
        let deserialized: ChatCompletionRequestMessage = serde_json::from_str(&serialized).unwrap();
        full_response.push(deserialized);
    }

    Ok((full_response, response))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextgenDoc {
    #[serde(rename = "_id")]
    pub id: bson::oid::ObjectId,
    pub userid: String,
    pub messages: Vec<ChatCompletionRequestMessage>,
}
