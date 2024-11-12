import {
	ChatInputCommandInteraction,
	Client,
	Collection,
	SlashCommandBuilder,
} from "discord.js";
import type { MongoClient } from "mongodb";
import type { Manager } from "moonlink.js";
import type { Ollama } from "ollama";

export interface Command {
	data: SlashCommandBuilder;
	execute: (interaction: ChatInputCommandInteraction) => void;
}

export interface ClientExtended extends Client {
	commands: Collection<string, Command>;
	ollama: Ollama;
	mongoclient: MongoClient;
	moonlink: Manager;
	usersMessaged: string[];
}

export class UserMadeError extends Error {
	constructor(message: string) {
		super(message);

		this.name = this.constructor.name;

		Error.captureStackTrace(this, this.constructor);

		Object.setPrototypeOf(this, UserMadeError.prototype);

		this.message = message;

		this.name = "UserMadeError";
	}
}

export function generateRandomString(length: number): string {
	const characters =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	const charactersLength = characters.length;

	for (let i = 0; i < length; i++) {
		const randomIndex = Math.floor(Math.random() * charactersLength);
		result += characters.charAt(randomIndex);
	}

	return result;
}
