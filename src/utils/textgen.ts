import type { ChatRequest, ChatResponse, Message, Ollama } from "ollama";

export type SyncOrAsyncFunction = (
	...args: string[]
) => string | Promise<string>;

export async function chatWithFuncs(
	ollama: Ollama,
	request: ChatRequest,
	functions: Record<string, SyncOrAsyncFunction> = {},
): Promise<{ full_response: Message[]; chat_response: ChatResponse }> {
	// Initialize full response with the initial messages
	const full_response: Message[] = request.messages || [];

	// Get the initial chat response
	let chat_response: ChatResponse = await ollama.chat({
		...request,
		stream: false,
	});
	full_response.push(chat_response.message);

	// While there are tool calls in the chat response
	while (
		chat_response.message.tool_calls &&
		chat_response.message.tool_calls.length > 0
	) {
		let toolCallResponse = "";

		for (const element of chat_response.message.tool_calls) {
			const func = functions[element.function.name];
			if (func) {
				// Optimized: Directly await the function call
				toolCallResponse += `Function "${
					element.function.name
				}" executed and returned: "${await func(
					...Object.values(element.function.arguments),
				)}"\n`;
			} else {
				toolCallResponse += `Function "${element.function.name}" not found.\n`;
			}
		}

		// Push the tool call responses into full_response
		full_response.push({ role: "tool", content: toolCallResponse });
		// Update the request messages with the updated full_response
		request.messages = full_response;

		// Get the next chat response after tool calls
		chat_response = await ollama.chat({ ...request, stream: false });
		full_response.push(chat_response.message);
	}

	return { full_response, chat_response };
}

export async function convertBlobToUint8Array(blob: Blob): Promise<Uint8Array> {
	try {
		const arrayBuffer = await new Response(blob).arrayBuffer();
		const uint8Array = new Uint8Array(arrayBuffer);
		return uint8Array;
	} catch (error) {
		console.error("Error converting to Uint8Array:", error);
		throw error;
	}
}
