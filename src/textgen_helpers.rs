use async_openai::{
    Client as OpenAIClient,
    types::responses::{
        CreateResponse, FunctionCallOutput, FunctionCallOutputItemParam, InputItem, InputParam,
        Item, OutputItem, Status, Tool, Truncation,
    },
};
use futures::future::BoxFuture;
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};

use mongodb::bson::doc;
use serde::{Deserialize, Serialize};

pub struct ToolsHandler {
    tools: Arc<Tool>,
    handler: Box<dyn Fn(Value) -> BoxFuture<'static, Result<String, DynError>> + Send + Sync>,
}

impl ToolsHandler {
    pub fn new<F>(tools: Arc<Tool>, handler: F) -> Self
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

    fn tools(&self) -> Arc<Tool> {
        Arc::clone(&self.tools)
    }
}

// Standard error alias
pub type DynError = Box<dyn std::error::Error + Send + Sync>;

pub async fn chat_with_funcs(
    messages: Vec<InputItem>,
    functions: HashMap<String, ToolsHandler>,
) -> Result<(Vec<InputItem>, String), DynError> {
    let mut full_response = messages.clone();

    // convert provided ToolsHandler -> ChatCompletionTools list
    let mut tools: Vec<Tool> = Vec::new();
    for tools_handler in functions.values() {
        tools.push((*tools_handler.tools()).clone());
    }

    let client = OpenAIClient::new();

    // send initial request
    let mut request = CreateResponse {
        model: Some("qwen3.6".to_string()),
        instructions: Some("You are Agent Kitten, a helpful AI powered discord bot made by the ClowderTech LLC. You are here to help people with their problems or to interact with the person to help them feel better. Your own website is https://agentkitten.com/. Please make sure to use your tools and function calls whenever useful. Also remember to follow discord's markdown syntax which is somewhat limited. You should ask questions to the user if it is needed to respond to them reasonably. There is no need to overthink the question.".to_string()),
        tools: Some(tools.clone()),
        input: InputParam::Items(full_response.clone()),
        truncation: Some(Truncation::Auto),
        ..Default::default()
    };

    let chat_response = client.responses().create(request).await?;
    let mut response = chat_response.clone();

    for output in response.output.clone() {
        full_response.push(InputItem::Item(output.into()));
    }

    // loop: while the latest choice contains tool calls, execute them, push tool messages, and re-call model
    loop {
        // ensure we have at least one choice
        if response.status != Status::Completed {
            return Err(Box::new(std::io::Error::other(
                "Textgen API Error, not completed",
            )));
        }

        let mut did_tool_call = false;

        for output_item in response.output.clone() {
            if let OutputItem::FunctionCall(tool_call) = output_item {
                let function_name = &tool_call.name;

                // find the handler
                match functions.get(function_name) {
                    Some(handler) => {
                        // parse the arguments as JSON Value (fall back to Null on parse error)
                        let func_args: Value =
                            serde_json::from_str(&tool_call.arguments).unwrap_or(Value::Null);

                        // execute handler (handler.execute returns a BoxFuture -> await it)
                        let tool_call_response: String = handler.execute(func_args).await?;

                        // build a tool message and append to full_response
                        let tool_message = FunctionCallOutputItemParam {
                            call_id: tool_call.call_id,
                            id: None,
                            status: None,
                            output: FunctionCallOutput::Text(tool_call_response),
                        };

                        full_response.push(InputItem::Item(Item::FunctionCallOutput(tool_message)));
                    }
                    None => {
                        // unknown function name — push an error-style tool message so the model sees it
                        let err_text =
                            format!("No handler registered for function: {}", function_name);

                        // build a tool message and append to full_response
                        let tool_message = FunctionCallOutputItemParam {
                            call_id: tool_call.call_id,
                            id: None,
                            status: None,
                            output: FunctionCallOutput::Text(err_text),
                        };

                        full_response.push(InputItem::Item(Item::FunctionCallOutput(tool_message)));
                    }
                }

                did_tool_call = true;
            }
        }

        if !(did_tool_call) {
            break;
        }

        // re-call the model with the updated full_response (which now includes tool replies)
        request = CreateResponse {
            model: Some("qwen3.6".to_string()),
            instructions: Some("You are Agent Kitten, a helpful AI powered discord bot made by the ClowderTech LLC. You are here to help people with their problems or to interact with the person to help them feel better. Your own website is https://agentkitten.com/. Please make sure to use your tools and function calls whenever useful. Also remember to follow discord's markdown syntax which is somewhat limited. You should ask questions to the user if it is needed to respond to them reasonably. There is no need to overthink the question.".to_string()),
            tools: Some(tools.clone()),
            input: InputParam::Items(full_response.clone()),
            truncation: Some(Truncation::Auto),
            ..Default::default()
        };

        let chat_response = client.responses().create(request).await?;
        response = chat_response.clone();

        for output in response.output.clone() {
            full_response.push(InputItem::Item(output.into()));
        }
    }

    let final_output = response.output_text().unwrap_or_default();

    Ok((full_response, final_output))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextgenDoc {
    #[serde(rename = "_id")]
    pub id: bson::oid::ObjectId,
    pub userid: String,
    pub messages: Vec<InputItem>,
}
