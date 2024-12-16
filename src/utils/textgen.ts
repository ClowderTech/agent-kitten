import type { ChatRequest, ChatResponse, Message, Ollama } from "ollama";
import { EmbedBuilder, type Message as DiscordMessage } from "discord.js";
import { Config, getNestedKey } from "./config.ts";
import { ClientExtended } from "./classes.ts";

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

// Define the mapping of S{num} to a user-friendly deletion message
const deletionReasons: { [key: string]: string } = {
    S1: "Promotes violent crimes, including terrorism, murder, assault, or animal abuse.",
    S2: "Promotes non-violent crimes, such as fraud, theft, or drug-related offenses.",
    S3: "Promotes or endorses sex-related crimes, including sexual assault or sex trafficking.",
    S4: "Involves or promotes child sexual exploitation.",
    S5: "Contains false information that could harm someone's reputation.",
    S6: "Contains specialized advice (financial, medical, legal) that could be dangerous or misleading.",
    S7: "Contains personal or sensitive information that could jeopardize someone's privacy or security.",
    S8: "Violates intellectual property rights, such as using copyrighted material without permission.",
    S9: "Promotes the creation of dangerous weapons like chemical, biological, or nuclear weapons.",
    S10: "Contains hate speech or dehumanizes individuals based on their race, gender, religion, or other personal characteristics.",
    S11: "Encourages self-harm, including suicide, self-injury, or harmful eating behaviors.",
    S12: "Contains explicit sexual content or erotica.",
    S13: "Contains incorrect information about elections or voting processes."
};

// Function to get the deletion message based on the code
function getDeletionMessage(code: string): string {
    return deletionReasons[code] || "Unknown reason for deletion.";
}

export async function scanMessage(message: DiscordMessage, configData: Config) {
	const client = message.client as ClientExtended;

	const channel = message.channel;

	if (!channel) {
		return;
	}

	const guild = message.guild;

	if (!guild) {
		return;
	}

	const messages = channel.messages.cache.last(
		Number(getNestedKey(configData, "moderation.automod.lookback")) ||
			1,
	);

	let messages_string = "";

	for (const message of messages) {
		messages_string += `Author Name: ${message.author.displayName}\nContent: ${message.content}\n\n`;
	}

	messages_string = messages_string.normalize().trim();

	const { chat_response } = await chatWithFuncs(
		client.ollama,
		{
			model: "llama-guard3:8b",
			messages: [
				{
					role: "user",
					content: messages_string
				}
			]
		}
	);

	const response = chat_response.message.content.normalize().trim()

	if (response.includes("unsafe")) {

		const reason = getDeletionMessage(response.replace("unsafe", "").trim())

		let log_channel_id =
			getNestedKey(configData, "moderation.automod.logchannel") ||
			null;

		if (
			typeof log_channel_id === "string" ||
			typeof log_channel_id === "number"
		) {
			if (typeof log_channel_id === "number") {
				log_channel_id = String(log_channel_id);
			}
			const log_channel =
				guild.channels.cache.get(log_channel_id) ||
				(await guild.channels.fetch(log_channel_id));
			if (log_channel && log_channel.isSendable()) {
				const embed = new EmbedBuilder()
					.setTimestamp(message.createdTimestamp)
					.setTitle("AutoMod Violation Alert")
					.setColor("Red")
					.addFields(
						{
							name: "Message Author",
							value: `<@!${message.author.id}> \`${message.author.id}\``,
						},
						{
							name: "Message Channel",
							value: `<#${message.channelId}> \`${message.channelId}\``,
						},
						{
							name: "Message Content",
							value: `\`\`\`${message.content}\`\`\``,
						},
						{
							name: "Violation Reason",
							value: `\`\`\`${reason}\`\`\``,
						},
					);

				await log_channel.send({ embeds: [embed] });
			}
		}

		try {
			const embed = new EmbedBuilder()
				.setTimestamp(message.createdTimestamp)
				.setTitle("AutoMod Violation")
				.setColor("Red")
				.addFields(
					{
						name: "Message Channel",
						value: `<#${message.channelId}> \`${message.channelId}\``,
					},
					{
						name: "Message Content",
						value: `\`\`\`${message.content}\`\`\``,
					},
					{
						name: "Violation Reason",
						value: `\`\`\`${reason}\`\`\``,
					},
				)
				.setFooter({
					text: "This message was detected using our AI AutoMod system. If you believe this was a mistake, please contact a staff member of the server.",
				});

			await message.author.send({ embeds: [embed] });
		} catch {
			// pass
		}

		await message.delete();
	}
}
