use async_openai::{
    Client as OpenAIClient,
    types::chat::{
        ChatCompletionMessageToolCalls, ChatCompletionRequestMessage,
        ChatCompletionRequestToolMessageArgs, ChatCompletionTool, ChatCompletionTools,
        CreateChatCompletionRequestArgs,
    },
};
use futures::future::BoxFuture;
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};

// use mongodb::bson::doc;
// use serde::{Deserialize, Serialize};

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
) -> Result<(Vec<ChatCompletionRequestMessage>, String), DynError> {
    let mut full_response = messages.clone();

    // convert provided ToolsHandler -> ChatCompletionTools list
    let mut tools: Vec<ChatCompletionTools> = Vec::new();
    for tools_handler in functions.values() {
        let tool = (*tools_handler.tools()).clone();
        tools.push(ChatCompletionTools::Function(tool));
    }

    let client = OpenAIClient::new();

    let textgen_model = std::env::var("TEXTGEN_MODEL").expect("Missing TEXTGEN_MODEL");

    // send initial request
    let request = CreateChatCompletionRequestArgs::default()
        .model(textgen_model.clone())
        .tools(tools.clone())
        .messages(full_response.clone())
        .build()?;

    let chat_response = client.chat().create(request).await?;
    let mut response = chat_response.clone();

    let mut response_message = response
        .choices
        .first()
        .ok_or("No choices")?
        .message
        .clone();
    let response_to_request: ChatCompletionRequestMessage =
        serde_json::from_value(serde_json::to_value(response_message.clone()).expect("dead"))
            .expect("dead");
    full_response.push(response_to_request);

    // loop: while the latest choice contains tool calls, execute them, push tool messages, and re-call model
    loop {
        let mut did_tool_call = false;

        if let Some(tool_calls) = response_message.clone().tool_calls {
            for tool_call_enum in tool_calls {
                if let ChatCompletionMessageToolCalls::Function(tool_call) = tool_call_enum {
                    let function_name = &tool_call.function.name;

                    // find the handler
                    match functions.get(function_name) {
                        Some(handler) => {
                            // parse the arguments as JSON Value (fall back to Null on parse error)
                            let func_args: Value =
                                serde_json::from_str(&tool_call.function.arguments)
                                    .unwrap_or(Value::Null);

                            // execute handler (handler.execute returns a BoxFuture -> await it)
                            let tool_call_response: String = handler.execute(func_args).await?;

                            let tool_output = ChatCompletionRequestToolMessageArgs::default()
                                .tool_call_id(&tool_call.id)
                                .content(tool_call_response)
                                .build()?;

                            full_response.push(tool_output.into());
                        }
                        None => {
                            // unknown function name — push an error-style tool message so the model sees it
                            let err_text =
                                format!("No handler registered for function: {}", function_name);

                            let tool_output = ChatCompletionRequestToolMessageArgs::default()
                                .tool_call_id(&tool_call.id)
                                .content(err_text)
                                .build()?;

                            full_response.push(tool_output.into());
                        }
                    }

                    did_tool_call = true;
                }
            }
        }

        if !(did_tool_call) {
            break;
        }

        let request = CreateChatCompletionRequestArgs::default()
            .model(textgen_model.clone())
            .tools(tools.clone())
            .messages(full_response.clone())
            .build()?;

        let chat_response = client.chat().create(request).await?;
        response = chat_response.clone();

        response_message = response
            .choices
            .first()
            .ok_or("No choices")?
            .message
            .clone();
        let response_to_request: ChatCompletionRequestMessage =
            serde_json::from_value(serde_json::to_value(response_message.clone()).expect("dead"))
                .expect("dead");
        full_response.push(response_to_request);
    }

    let final_output = response_message.clone().content.unwrap();

    Ok((full_response, final_output))
}

// #[derive(Debug, Clone, Serialize, Deserialize)]
// pub struct TextgenDoc {
//     #[serde(rename = "_id")]
//     pub id: bson::oid::ObjectId,
//     pub userid: String,
//     pub messages: Vec<ChatCompletionRequestMessage>,
// }
