import { promises as fsPromises } from "node:fs";
import { join } from "node:path";
import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, REST, Routes } from "discord.js";
import type { Command } from "../utils/classes.ts";

const checkForValidFile = (file: string): boolean => {
	const fileExtension = file.split(".").pop();
	return fileExtension === "js" || fileExtension === "ts";
};

const getAllFiles = async (dirPath: string): Promise<string[]> => {
	const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const fullPath = join(dirPath, entry.name);
			return entry.isDirectory() ? getAllFiles(fullPath) : [fullPath];
		})
	);
	return files.flat();
};

const loadCommands = async (
	commandsPath: string
): Promise<Record<string, Command>[]> => {
	const commandFiles = await getAllFiles(commandsPath);
	const commands = [];
	for (const file of commandFiles) {
		if (checkForValidFile(file)) {
			const command = await import(file);
			if ("data" in command && "execute" in command) {
				commands.push(command.data.toJSON());
			} else {
				console.warn(
					`Warn: ${file} does not have the proper structure.`
				);
			}
		}
	}
	return commands;
};

export const data = new SlashCommandBuilder()
	.setName("sync")
	.setDescription("Sync the bot's commands with the commands folder.");

export async function execute(interaction: CommandInteraction) {
	try {
		const commandsPath = join(import.meta.dirname!, "..", "commands");
		const devCommandsPath = join(import.meta.dirname!, "..", "devCommands");

		const commands = await loadCommands(commandsPath);
		const devCommands = await loadCommands(devCommandsPath);

		const rest = new REST().setToken(interaction.client.token!);

		console.log("Started refreshing application (/) commands.");

		await rest.put(
			Routes.applicationCommands(interaction.client.user!.id),
			{
				body: commands,
			}
		);

		await rest.put(
			Routes.applicationGuildCommands(
				interaction.client.user!.id,
				"1185316093078802552"
			),
			{ body: devCommands }
		);

		console.log("Successfully reloaded application (/) commands.");

		await interaction.reply(
			`Synced ${commands.length + devCommands.length} commands.`
		);
	} catch (error) {
		console.error(error);
		await interaction.reply("There was an error while syncing commands.");
	}
}
