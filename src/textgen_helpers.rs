use async_openai::{
    Client as OpenAIClient,
    types::responses::{
        CreateResponseArgs, FunctionCallOutput, FunctionCallOutputItemParam, FunctionToolArgs,
        InputContent, InputItem, InputParam, InputTextContent, Item, OutputItem, Tool,
    },
};
use futures::{FutureExt, future::BoxFuture};
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};

// use mongodb::bson::doc;
// use serde::{Deserialize, Serialize};

type BoxedToolHandler =
    Box<dyn Fn(Value) -> BoxFuture<'static, Result<Vec<InputContent>, DynError>> + Send + Sync>;

pub struct ToolsHandler {
    tools: Arc<Tool>,
    handler: BoxedToolHandler,
}

impl ToolsHandler {
    fn from_tool<F>(tools: Tool, handler: F) -> Self
    where
        F: Fn(Value) -> BoxFuture<'static, Result<Vec<InputContent>, DynError>>
            + Send
            + Sync
            + 'static,
    {
        Self {
            tools: Arc::new(tools),
            handler: Box::new(handler),
        }
    }

    fn execute(&self, args: Value) -> BoxFuture<'static, Result<Vec<InputContent>, DynError>> {
        (self.handler)(args)
    }

    fn tools(&self) -> Arc<Tool> {
        Arc::clone(&self.tools)
    }
}

pub type ToolRegistry = HashMap<String, ToolsHandler>;

pub struct RegisteredTools(ToolRegistry);

impl RegisteredTools {
    pub fn new() -> Self {
        Self(ToolRegistry::new())
    }

    pub fn register(self, tool: RegisteredTool) -> Self {
        let mut this = self;
        this.0.insert(tool.name, tool.handler);
        this
    }

    pub fn build(self) -> ToolRegistry {
        self.0
    }
}

impl Default for RegisteredTools {
    fn default() -> Self {
        Self::new()
    }
}

pub struct RegisteredTool {
    name: String,
    handler: ToolsHandler,
}

pub fn tool(name: impl Into<String>) -> ToolBuilder {
    ToolBuilder {
        name: name.into(),
        description: None,
        parameters: None,
    }
}

pub struct ToolBuilder {
    name: String,
    description: Option<String>,
    parameters: Option<Value>,
}

impl ToolBuilder {
    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    pub fn parameters(mut self, parameters: Value) -> Self {
        self.parameters = Some(parameters);
        self
    }

    pub fn handler<H>(self, handler: H) -> Result<RegisteredTool, DynError>
    where
        H: IntoToolHandler,
    {
        let name = self.name.clone();
        let mut builder = FunctionToolArgs::default();
        let mut args = builder.name(name.clone());
        if let Some(description) = self.description {
            args = args.description(description);
        }
        if let Some(parameters) = self.parameters {
            args = args.parameters(parameters).strict(true);
        }
        Ok(RegisteredTool {
            name,
            handler: ToolsHandler::from_tool(Tool::Function(args.build()?), handler.into_handler()),
        })
    }
}

pub trait IntoToolHandler {
    fn into_handler(self) -> BoxedToolHandler
    where
        Self: Sized;
}

impl<H, Fut, R, E> IntoToolHandler for H
where
    H: Fn(Value) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<R, E>> + Send + 'static,
    R: Into<Vec<InputContent>>,
    E: Into<DynError>,
{
    fn into_handler(self) -> BoxedToolHandler
    where
        Self: Sized,
    {
        Box::new(move |args: Value| {
            let fut = self(args);
            async move { fut.await.map(Into::into).map_err(Into::into) }.boxed()
        })
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

    let textgen_model = std::env::var("TEXTGEN_MODEL").expect("Missing TEXTGEN_MODEL");
    let system_instructions = "You are Agent Kitten, a helpful AI powered discord bot made by ClowderTech LLC. You are here to help people with their problems or to interact with the person to help them feel better. Your own website is https://agentkitten.com/. Please make sure to use your tools and function calls whenever useful. Also remember to follow discord's markdown syntax which is somewhat limited. You should ask questions to the user if it is needed to respond to them reasonably. There is no need to overthink the question.";

    let mut chat_response;

    // loop: while the latest choice contains tool calls, execute them, push tool messages, and re-call model
    loop {
        // send initial request
        let request = CreateResponseArgs::default()
            .instructions(system_instructions)
            .model(textgen_model.clone())
            .tools(tools.clone())
            .input(InputParam::Items(full_response.clone()))
            .build()?;

        chat_response = client.responses().create(request).await?;

        full_response.extend(
            chat_response
                .output
                .clone()
                .into_iter()
                .map(InputItem::from),
        );

        let mut did_tool_call = false;

        for response_message in chat_response.output.clone() {
            if let OutputItem::FunctionCall(tool_call) = response_message {
                let function_name = &tool_call.name;

                // find the handler
                match functions.get(function_name) {
                    Some(handler) => {
                        // parse the arguments as JSON Value (fall back to Null on parse error)
                        let func_args: Value =
                            serde_json::from_str(&tool_call.arguments).unwrap_or(Value::Null);

                        // execute handler (handler.execute returns a BoxFuture -> await it)
                        let tool_call_response = match handler.execute(func_args).await {
                            Ok(returnable) => returnable,
                            Err(error) => {
                                let final_sendable: Vec<InputContent> = vec![
                                    InputTextContent::from(format!(
                                        "Function has returned an error: {}",
                                        error
                                    ))
                                    .into(),
                                ];
                                final_sendable
                            }
                        };

                        let tool_output = FunctionCallOutputItemParam {
                            call_id: Some(tool_call.call_id),
                            id: tool_call.id,
                            status: tool_call.status,
                            name: Some(tool_call.name),
                            namespace: tool_call.namespace,
                            caller: tool_call.caller,
                            output: FunctionCallOutput::Content(tool_call_response),
                        };

                        full_response.push(InputItem::Item(Item::FunctionCallOutput(tool_output)));
                    }
                    None => {
                        // unknown function name — push an error-style tool message so the model sees it
                        let err_text: Vec<InputContent> = vec![
                            InputTextContent::from(format!(
                                "No handler registered for function: {}",
                                function_name
                            ))
                            .into(),
                        ];

                        let tool_output = FunctionCallOutputItemParam {
                            call_id: Some(tool_call.call_id),
                            id: tool_call.id,
                            status: tool_call.status,
                            name: Some(tool_call.name),
                            namespace: tool_call.namespace,
                            caller: tool_call.caller,
                            output: FunctionCallOutput::Content(err_text),
                        };

                        full_response.push(InputItem::Item(Item::FunctionCallOutput(tool_output)));
                    }
                }

                did_tool_call = true;
            }
        }

        if !did_tool_call && chat_response.output_text().is_some() {
            break;
        }
    }

    let final_output = chat_response.output_text().unwrap_or_default();

    Ok((full_response, final_output))
}
