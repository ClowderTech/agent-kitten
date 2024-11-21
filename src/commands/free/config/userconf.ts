import {
	EmbedBuilder,
	SlashCommandBuilder,
	ChatInputCommandInteraction,
} from "discord.js";
import type { ClientExtended } from "../../../utils/classes.ts";
import { getData, setData } from "../../../utils/mongohelper.ts"; // Adjust the import path as necessary
import {
	getNestedKey,
	setNestedKey,
	type Config,
} from "../../../utils/config.ts";

export const data = new SlashCommandBuilder()
	.setName("userconf")
	.setDescription("Manage your user configuration options.")
	.addSubcommand((subcommand) =>
		subcommand
			.setName("set")
			.setDescription("Set a user configuration option.")
			.addStringOption((option) =>
				option
					.setName("key")
					.setDescription("The configuration key you want to set")
					.setRequired(true),
			)
			.addStringOption((option) =>
				option
					.setName("value")
					.setDescription("The configuration value to set")
					.setRequired(true),
			),
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("get")
			.setDescription("Get a user configuration option.")
			.addStringOption((option) =>
				option
					.setName("key")
					.setDescription("The configuration key you want to get")
					.setRequired(true),
			),
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("setraw")
			.setDescription("Set the raw user configuration.")
			.addStringOption((option) =>
				option
					.setName("value")
					.setDescription(
						"The raw configuration value as a JSON string",
					)
					.setRequired(true),
			),
	) // New raw set command
	.addSubcommand((subcommand) =>
		subcommand
			.setName("getraw")
			.setDescription("Get the entire raw user configuration."),
	); // New raw get command

export async function execute(interaction: ChatInputCommandInteraction) {
	const userId = interaction.user.id; // Get the ID of the user executing the command
	const client = interaction.client as ClientExtended;

	const userData = await getData(client, "config", { userId: userId });
	const oldConfigData: Config = userData[0]?.config || {};

	// Determine which subcommand is called
	const subcommand = interaction.options.getSubcommand(); // Get subcommand directly

	if (subcommand === "set") {
		const key = interaction.options.get("key")?.value as string;
		const value = interaction.options.get("value")?.value as string;

		let parsedValue: string | number | boolean;
		try {
			parsedValue = JSON.parse(value); // Attempt to parse it
		} catch {
			parsedValue = value; // If parsing fails, keep it as a string
		}

		const configData = {
			userId: userId,
			config: setNestedKey({ ...oldConfigData }, key, parsedValue),
		};

		try {
			if (userData.length > 0) {
				await setData(client, "config", configData, userData[0]._id); // Update existing config
			} else {
				await setData(client, "config", configData); // Insert new config
			}

			const embed = new EmbedBuilder()
				.setTitle("User Configuration Updated")
				.setColor("#2b2d31")
				.setTimestamp()
				.addFields(
					{ name: "Your Key", value: key, inline: true },
					{ name: "New Value", value: value },
				);

			await interaction.reply({ embeds: [embed], ephemeral: true });
		} catch (error) {
			console.error(`Error updating user configuration: ${error}`);
			await interaction.reply({
				content: "There was an error updating your configuration.",
				ephemeral: true,
			});
		}
	} else if (subcommand === "get") {
		// Handling the 'get' subcommand
		const key = interaction.options.getString("key", true) as string; // Optional key

		const value = getNestedKey(oldConfigData, key);

		if (value) {
			await interaction.reply({
				content: `Value for \`${key}\`: ${value}`,
				ephemeral: true,
			});
		} else {
			await interaction.reply({
				content: `Key \`${key}\` not found.`,
				ephemeral: true,
			});
		}
	} else if (subcommand === "setraw") {
		// Handling the 'setraw' subcommand
		const rawValue = interaction.options.get("value")?.value as string;
		let parsedData;

		try {
			parsedData = JSON.parse(rawValue); // Parse the raw JSON string
		} catch {
			await interaction.reply({
				content:
					"Invalid JSON format. Please provide a valid JSON string.",
				ephemeral: true,
			});
			return;
		}

		const configData = {
			userId: userId,
			config: parsedData, // Set to the parsed JSON object
		};

		try {
			if (userData.length > 0) {
				await setData(client, "config", configData, userData[0]._id); // Update existing raw config
			} else {
				await setData(client, "config", configData); // Insert new raw config
			}

			await interaction.reply({
				content: "Raw configuration has been updated successfully.",
				ephemeral: true,
			});
		} catch (error) {
			console.error(`Error updating raw user configuration: ${error}`);
			await interaction.reply({
				content: "There was an error updating your raw configuration.",
				ephemeral: true,
			});
		}
	} else if (subcommand === "getraw") {
		// Handling the 'getraw' subcommand
		await interaction.reply({
			content: `Raw configuration: \n\`\`\`json\n${JSON.stringify(
				oldConfigData,
				null,
				2,
			)}\n\`\`\``,
			ephemeral: true,
		});
	}
}
