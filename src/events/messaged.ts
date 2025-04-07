import { Events, Message } from "discord.js";
import { prettyExpGain } from "../utils/leveling.ts";
import type { ClientExtended } from "../utils/classes.ts";
import { getData } from "../utils/mongohelper.ts";
import { type Config, getNestedKey } from "../utils/config.ts";
import { scanMessage } from "../utils/textgen.ts";

export const eventType: Events = Events.MessageCreate;

export async function execute(message: Message) {
	if (message.author.bot) return;

	const client = message.client as ClientExtended;

	if (!message.inGuild()) {
		return;
	}

	const serverData = await getData(client, "config", {
		serverid: message.guildId,
	});

	const configData: Config = serverData[0]?.config || {};

	if (!client.usersMessaged.includes(message.author.id)) {
		prettyExpGain(
			client,
			message.author,
			message.guild,
			message.channel,
			2 * Number(getNestedKey(configData, "leveling.expmultiplier")) || 1
		);
		client.usersMessaged.push(message.author.id);
	}

	if (getNestedKey(configData, "moderation.automod.enabled")) {
		const role = getNestedKey(configData, "moderation.automod.bypassrole");

		if (!role || !message.member?.roles.cache.has(String(role))) {
			await scanMessage(message, configData);
		}
	}
}
