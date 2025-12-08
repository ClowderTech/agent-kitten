use async_openai::{
    Client as OpenAIClient,
    types::chat::{
        ChatCompletionMessageToolCalls, ChatCompletionRequestMessage,
        ChatCompletionRequestToolMessageArgs, CreateChatCompletionRequest,
        CreateChatCompletionResponse,
    },
};
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use mongodb::bson::doc;
use serde::{Deserialize, Serialize};

// Boxed future alias
type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send + 'static>>;

// Standard error alias
type DynError = Box<dyn std::error::Error + Send + Sync>;

// Sync handler: takes Value, returns Result<Value, Err>
type SyncFn = Box<dyn Fn(Value) -> Result<String, DynError> + Send + Sync + 'static>;

// Async handler: takes Value, returns a boxed Future that yields Result<Value, Err>
type AsyncFn = Box<dyn Fn(Value) -> BoxFuture<Result<String, DynError>> + Send + Sync + 'static>;

/// A handler that is either synchronous or asynchronous
pub enum Func {
    Sync(SyncFn),
    Async(AsyncFn),
}

impl Func {
    /// Helper to call the handler and always return a future-like result:
    /// - if Sync, the result is ready immediately
    /// - if Async, it awaits the inner future
    pub async fn call(&self, args: Value) -> Result<String, DynError> {
        match self {
            Func::Sync(f) => (f)(args),
            Func::Async(f) => (f)(args).await,
        }
    }
}

pub type Funcs = HashMap<String, Func>;

pub async fn chat_with_funcs(
    messages: Vec<ChatCompletionRequestMessage>,
    functions: Funcs,
) -> Result<
    (
        Vec<ChatCompletionRequestMessage>,
        CreateChatCompletionResponse,
    ),
    DynError,
> {
    let mut full_response = messages.clone();

    let request = CreateChatCompletionRequest {
        model: "gpt-oss:20b".to_string(),
        messages: full_response.clone(),
        ..Default::default()
    };

    let client = OpenAIClient::new();

    let chat_response = client.chat().create(request).await?;
    let mut response: CreateChatCompletionResponse = chat_response.clone();
    let serialized = serde_json::to_string(&chat_response.choices[0].message).unwrap();
    let deserialized: ChatCompletionRequestMessage = serde_json::from_str(&serialized).unwrap();
    full_response.push(deserialized);

    while let Some(tool_calls) = chat_response
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
                let tool_call_response: String = func.call(func_args).await?;
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

#[derive(Debug, Serialize, Deserialize)]
pub struct TextgenDoc {
    #[serde(rename = "_id")]
    pub id: Option<bson::oid::ObjectId>,
    pub userid: String,
    pub messages: Vec<ChatCompletionRequestMessage>,
}
