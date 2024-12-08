import { Events, Message } from "discord.js";
import { prettyExpGain } from "../utils/leveling.ts";
import type { ClientExtended } from "../utils/classes.ts";
import { getData } from "../utils/mongohelper.ts";
import { getNestedKey, type Config } from "../utils/config.ts";
import { chatWithFuncs } from "../utils/textgen.ts";

export const eventType: Events = Events.MessageCreate;

export const once = false;

export async function execute(message: Message) {
	if (message.author.bot) return;

	const client = message.client as ClientExtended;

	if (!client.usersMessaged.includes(message.author.id)) {
		prettyExpGain(client, message.author);
		client.usersMessaged.push(message.author.id);
	}

	if (!message.inGuild()) {
		return;
	}

	const serverData = await getData(client, "config", {
		serverId: message.guildId,
	});
	const configData: Config = serverData[0]?.config || {};

	if (getNestedKey(configData, "moderation.automod.enabled")) {
		const rules =
			getNestedKey(configData, "moderation.automod.rules") ||
			`#### 1. Respect and Etiquette
- Be respectful to all members, including staff.
- Avoid using offensive language or hate speech.

#### 2. Channels Usage
- Use appropriate channels for specific topics (e.g., #general for general chat, #music for music requests).
- Do not spam messages in any channel.

#### 3. No Advertising Spam
- Do not advertise products, services, or websites that are unrelated to the server's purpose.

#### 4. No Harassment and Bullying
- Do not harass or bully other members; this includes private messages as well.

#### 5. No NSFW Content in Public Channels
- Keep explicit content (NSFW) for designated channels only.

#### 6. No Leaking Private Information
- Respect privacy by not sharing personal information about other members without their consent.

#### 7. No Bot Misuse
- Do not misuse bots (e.g., spamming commands, using them for harassment).`;

		const { chat_response } = await chatWithFuncs(client.ollama, {
			model: "qwen2.5:1.5b",
			messages: [
				{
					role: "system",
					content: `You are an AI Moderation bot. Your job is to moderate a discord server based on the set rules. If there is an offending message, state its Message ID. If there are multiple offending messages, seperate them with a comma. Otherwise, say anything else. The rules are as follows:\n\n${rules}`,
				},
				{
					role: "user",
					content: `Message ID: ${message.id}\nContent: ${message.content}`,
				},
			],
		});

		const discordMessageIdPattern = /^\d{17}$/;

		const channel = message.channel;

		const response = chat_response.message.content
			.normalize()
			.trim()
			.replaceAll(" ", "")
			.split(",");
		for (const possible of response) {
			if (discordMessageIdPattern.test(possible)) {
				await channel.messages.cache.get(possible)!.delete();
			}
		}
	}
}
