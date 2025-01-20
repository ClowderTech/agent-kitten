import { promises as fsPromises } from "node:fs";
import { join } from "node:path";
import {
	SlashCommandBuilder,
	SlashCommandStringOption,
} from "@discordjs/builders";
import { Collection, CommandInteraction } from "discord.js";
import type { ClientExtended } from "../utils/classes.ts";

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

export const data = new SlashCommandBuilder()
	.setName("reload")
	.setDescription("Hot reload a command.")
	.addStringOption((option: SlashCommandStringOption) =>
		option
			.setName("command")
			.setDescription("The command to reload.")
			.setRequired(true)
	);

export async function execute(interaction: CommandInteraction) {
	if (!("commands" in interaction.client)) {
		await interaction.reply({
			content: "The bot is not ready to reload commands.",
			ephemeral: true,
		});
		return;
	} else if (!(interaction.client.commands instanceof Collection)) {
		await interaction.reply({
			content: "The bot is not ready to reload commands.",
			ephemeral: true,
		});
		return;
	}

	const client = interaction.client as ClientExtended;

	const commandName = interaction.options.get("command", true)
		.value as string;
	const command = client.commands.get(commandName);

	if (!command) {
		await interaction.reply({
			content: "The command does not exist.",
			ephemeral: true,
		});
		return;
	}

	const foldersPath = join(import.meta.dirname!, "..", "commands");
	const devFoldersPath = join(import.meta.dirname!, "..", "devCommands");

	const reloadCommand = async (folderPath: string) => {
		const commandFiles = await getAllFiles(folderPath);
		for (const file of commandFiles) {
			if (checkForValidFile(file)) {
				const command = await import(file);
				if ("data" in command && "execute" in command) {
					if (commandName === command.data.name) {
						try {
							client.commands.delete(command.data.name);
							const newCommand = await import(file);
							client.commands.set(
								newCommand.data.name,
								newCommand
							);
							await interaction.reply(
								`Command \`${newCommand.data.name}\` was reloaded!`
							);
							return true;
						} catch (error: unknown) {
							if (error instanceof Error) {
								console.error(error);
								await interaction.reply(
									`There was an error while reloading a command \`${command.data.name}\`:\n\`\`\`${error.message}\`\`\``
								);
							} else {
								console.error(error);
								await interaction.reply(
									`There was an unkown error while reloading a command \`${command.data.name}\``
								);
							}
							return false;
						}
					}
				}
			}
		}
		return false;
	};

	// Try to reload the command from the main commands folder
	if (await reloadCommand(foldersPath)) return;
	// Try to reload the command from the devCommands folder
	if (await reloadCommand(devFoldersPath)) return;

	await interaction.reply({
		content: "The command does not exist in the specified paths.",
		ephemeral: true,
	});
}
