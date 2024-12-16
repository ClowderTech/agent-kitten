import { Events, Message } from "discord.js";
import { prettyExpGain } from "../utils/leveling.ts";
import type { ClientExtended } from "../utils/classes.ts";
import { getData } from "../utils/mongohelper.ts";
import { getNestedKey, type Config } from "../utils/config.ts";
import { scanMessage } from "../utils/textgen.ts";

export const eventType: Events = Events.MessageCreate;


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
		await scanMessage(message, configData)
	}
}
