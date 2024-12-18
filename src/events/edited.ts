import { Events, Message } from "discord.js";
import type { ClientExtended } from "../utils/classes.ts";
import { getData } from "../utils/mongohelper.ts";
import { type Config, getNestedKey } from "../utils/config.ts";
import { scanMessage } from "../utils/textgen.ts";

export const eventType: Events = Events.MessageUpdate;

export const once = false;

export async function execute(_oldMessage: Message, newMessage: Message) {
	if (newMessage.author.bot) return;

	const client = newMessage.client as ClientExtended;

	if (!newMessage.inGuild()) {
		return;
	}

	const serverData = await getData(client, "config", {
		serverId: newMessage.guildId,
	});
	const configData: Config = serverData[0]?.config || {};

	if (getNestedKey(configData, "moderation.automod.enabled")) {
		await scanMessage(newMessage, configData);
	}
}
