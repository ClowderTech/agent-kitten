import { EmbedBuilder, Events, Message } from "discord.js";
import { prettyExpGain } from "../utils/leveling.ts";
import type { ClientExtended } from "../utils/classes.ts";
import { getData } from "../utils/mongohelper.ts";
import { getNestedKey, type Config } from "../utils/config.ts";
import { chatWithFuncs } from "../utils/textgen.ts";
import { launch } from "puppeteer";

export const eventType: Events = Events.MessageCreate;

export const once = false;

async function searchGoogle(query: string): Promise<string> {
	const searchResultsAmount = 3;
	const escapedTerm = encodeURIComponent(query);
	const url = `https://searx.clowdertech.com/search?q=${escapedTerm}&language=auto&time_range=&safesearch=0&categories=general&format=json`;

	let searchResults = "";
	let start = 0;

	const browser = await launch({ headless: true, args: ["--no-sandbox"] });
	const page = await browser.newPage();

	try {
		const response = await page.goto(url, {
			timeout: 30000,
			waitUntil: "load",
		});
		if (!response?.ok()) {
			return `Response not ok. Status ${response?.status()}.`;
		}
		const data = await response.json();
		const results = data.results;
		for (const result of results) {
			searchResults += `[${start + 1}] ${result.url} || ${
				result.content
			}\n`;
			start += 1;
			if (start === searchResultsAmount) {
				break;
			}
		}
	} catch (error) {
		return `An error occurred: ${error}`;
	} finally {
		await browser.close();
	}

	return searchResults;
}

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

		let messages_string = `Channel Name: ${channel.name}\nChannel ID: ${channel.id}\n\n`;

		for (const message of messages) {
			messages_string += `Message ID: ${message.id}\nAuthor ID: ${message.author.id}\nAuthor Name: ${message.author.displayName}\nContent: ${message.content}\n\n`;
		}

		messages_string = messages_string.normalize().trim();

		const { chat_response } = await chatWithFuncs(
			client.ollama,
			{
				model: "marco-o1:7b",
				messages: [
					{
						role: "system",
						content: `You are an AI Moderation bot. Your job is to moderate a discord server based on the set rules. If there is an offending message, state its Message ID and the reason for offending seperated by a semicolon and nothing else. If there are multiple offending messages, seperate them with a comma. If the message does not offend any rules or is generally acceptable, do not ever state its Message ID, any semicolon, or any comma. You must be at least 95% sure it breaks a rule and it must be stated in the rules, no assuming. The rules are as follows:\n\n${rules}`,
					},
					{
						role: "user",
						content: messages_string,
					},
				],
			// 	tools: [
			// 		{
			// 			type: "function",
			// 			function: {
			// 				name: "search",
			// 				description: "Search on Google.",
			// 				parameters: {
			// 					type: "object",
			// 					properties: {
			// 						query: {
			// 							type: "string",
			// 							description: "The search query.",
			// 						},
			// 					},
			// 					required: ["query"],
			// 				},
			// 			},
			// 		},
			// 	],
			},
			// {
			// 	search: searchGoogle,
			// },
		);

		const discordMessageIdPattern = /^\d{17,19}$/;

		const response = chat_response.message.content
			.normalize()
			.trim()
			.replace(/^.*?<Output>/, "")
			.replace("</Output>", "")
			.split(",")

		for (const possible of response) {
			if (possible.length >= 1) {
				const possible_split = possible.trim().split(";");
				if (possible_split.length >= 3 || possible_split.length <= 0) {
					continue;
				}
				possible_split[0] = possible_split[0].trim();
				if (!discordMessageIdPattern.test(possible_split[0])) {
					continue;
				}
				possible_split[1] =
					possible_split[1].trim() || "No specified reason.";

				const message =
					channel.messages.cache.get(possible_split[0]) ||
					(await channel.messages.fetch(possible_split[0]));

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
									value: `\`\`\`${possible_split[1]}\`\`\``,
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
								value: `\`\`\`${possible_split[1]}\`\`\``,
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
	}
}
