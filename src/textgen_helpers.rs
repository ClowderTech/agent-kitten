use async_openai::{
    Client as OpenAIClient,
    types::chat::{
        ChatCompletionMessageToolCalls, ChatCompletionRequestMessage,
        ChatCompletionRequestToolMessageArgs, ChatCompletionTool, ChatCompletionTools,
        CreateChatCompletionRequestArgs, CreateChatCompletionResponse,
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

    // convert provided ToolsHandler -> ChatCompletionTools list
    let mut tools: Vec<ChatCompletionTools> = Vec::new();
    for tools_handler in functions.values() {
        let tool = (*tools_handler.tools()).clone();
        tools.push(ChatCompletionTools::Function(tool));
    }

    let client = OpenAIClient::new();

    // send initial request
    let mut request = CreateChatCompletionRequestArgs::default()
        .tools(tools.clone())
        .messages(full_response.clone())
        .model("qwen3.5:35b")
        .build()?;

    let chat_response = client.chat().create(request).await?;
    let mut response = chat_response.clone();

    // convert the model's first message into a request-message and push it
    // (keep your serialization round-trip since types differ)
    let serialized =
        serde_json::to_string(&chat_response.choices.first().unwrap().message).unwrap();
    let deserialized: ChatCompletionRequestMessage = serde_json::from_str(&serialized).unwrap();
    full_response.push(deserialized);

    // loop: while the latest choice contains tool calls, execute them, push tool messages, and re-call model
    loop {
        // ensure we have at least one choice
        if response.choices.is_empty() {
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "No choices in response",
            )));
        }

        // examine the first choice's tool_calls
        let choice = response.choices.first().unwrap().clone();
        let tool_calls_opt = choice.message.tool_calls.clone();

        // if no tool calls -> break
        let tool_calls = match tool_calls_opt {
            Some(tc) if !tc.is_empty() => tc,
            _ => break,
        };

        // execute each tool call
        for tool_call_enum in tool_calls {
            if let ChatCompletionMessageToolCalls::Function(tool_call) = tool_call_enum {
                let function_name = &tool_call.function.name;

                // find the handler
                match functions.get(function_name) {
                    Some(handler) => {
                        // parse the arguments as JSON Value (fall back to Null on parse error)
                        let func_args: Value = serde_json::from_str(&tool_call.function.arguments)
                            .unwrap_or(Value::Null);

                        // execute handler (handler.execute returns a BoxFuture -> await it)
                        let tool_call_response: String = handler.execute(func_args).await?;

                        // build a tool message and append to full_response
                        let tool_message = ChatCompletionRequestToolMessageArgs::default()
                            .content(tool_call_response)
                            .tool_call_id(tool_call.id.clone())
                            .build()?
                            .into();

                        full_response.push(tool_message);
                    }
                    None => {
                        // unknown function name — push an error-style tool message so the model sees it
                        let err_text =
                            format!("No handler registered for function: {}", function_name);
                        let tool_message = ChatCompletionRequestToolMessageArgs::default()
                            .content(err_text)
                            .tool_call_id(tool_call.id.clone())
                            .build()?
                            .into();
                        full_response.push(tool_message);
                    }
                }
            }
        }

        // re-call the model with the updated full_response (which now includes tool replies)
        request = CreateChatCompletionRequestArgs::default()
            .tools(tools.clone())
            .messages(full_response.clone())
            .model("qwen3.5:35b")
            .build()?;

        let chat_response = client.chat().create(request).await?;
        response = chat_response.clone();

        // push the model's produced message into the conversation history (round-trip again)
        let serialized =
            serde_json::to_string(&chat_response.choices.first().unwrap().message).unwrap();
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
