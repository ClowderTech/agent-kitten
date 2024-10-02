import { Events, Message } from "discord.js";
import { prettyExpGain } from "../utils/leveling.ts";
import type { ClientExtended } from "../utils/classes.ts";

export const eventType: Events = Events.MessageCreate;

export const once = false;

export function execute(message: Message) {
	if (message.author.bot) return;

	const client = message.client as ClientExtended;

	if (!client.usersMessaged.includes(message.author.id)) {
		prettyExpGain(client, message.author);
		client.usersMessaged.push(message.author.id);
	}
}
