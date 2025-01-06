import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import type { ClientExtended } from "../../utils/classes.ts";
import { ObjectId } from "mongodb";
import { getData, setData } from "../../utils/mongohelper.ts"; // Adjust the import path as necessary
import { getNestedKey, setNestedKey, UserConfig } from "../../utils/config.ts";

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
					.setRequired(true)
					.setChoices([
						{
							name: "leveling.levelupmessaging",
							value: "leveling.levelupmessaging",
						},
					])
			)
			.addStringOption((option) =>
				option
					.setName("value")
					.setDescription("The configuration value to set")
					.setRequired(true)
			)
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("get")
			.setDescription("Get a user configuration option.")
			.addStringOption((option) =>
				option
					.setName("key")
					.setDescription("The configuration key you want to get")
					.setRequired(true)
					.setChoices([
						{
							name: "leveling.levelupmessaging",
							value: "leveling.levelupmessaging",
						},
					])
			)
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
					.setRequired(true)
			)
	) // New raw set command
	.addSubcommand((subcommand) =>
		subcommand
			.setName("getraw")
			.setDescription("Get the entire raw user configuration.")
	); // New raw get command

export async function execute(interaction: ChatInputCommandInteraction) {
	const userId = interaction.user.id; // Get the ID of the user executing the command
	const client = interaction.client as ClientExtended;

	const serverData = await getData(client, "config", {
		userid: userId,
	}) as UserConfig[];
	let userConf: UserConfig;
	if (serverData.length > 0) {
		userConf = serverData[0];
	} else {
		userConf = {
			_id: new ObjectId(),
			config: {},
			userid: userId,
		};
	}

	// Determine which subcommand is called
	const subcommand = interaction.options.getSubcommand(); // Get subcommand directly

	if (subcommand === "set") {
		const key = interaction.options.getString("key", true);
		const value = interaction.options.getString("value", true);

		let parsedValue;
		try {
			parsedValue = JSON.parse(value); // Attempt to parse it
		} catch {
			parsedValue = value; // If parsing fails, keep it as a string
		}

		userConf.config = setNestedKey(userConf.config, key, parsedValue);

		try {
			await setData(
				client,
				"config",
				userConf,
			);

			const embed = new EmbedBuilder()
				.setTitle("User Configuration Updated")
				.setColor(0x9A2D7D)
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
				flags: [MessageFlags.Ephemeral],
			});
		}
	} else if (subcommand === "get") {
		// Handling the 'get' subcommand
		const key = interaction.options.getString("key", true) as string; // Optional key

		const value = getNestedKey(userConf.config, key);

		if (value != null) {
			await interaction.reply({
				content: `Value for \`${key}\`: \`${value}\``,
				flags: [MessageFlags.Ephemeral],
			});
		} else {
			await interaction.reply({
				content: `Key \`${key}\` not found.`,
				flags: [MessageFlags.Ephemeral],
			});
		}
	} else if (subcommand === "setraw") {
		// Handling the 'setraw' subcommand
		const rawValue = interaction.options.getString("value", true);
		let parsedData;

		try {
			parsedData = JSON.parse(rawValue); // Parse the raw JSON string
		} catch {
			await interaction.reply({
				content:
					"Invalid JSON format. Please provide a valid JSON string.",
				flags: [MessageFlags.Ephemeral],
			});
			return;
		}

		userConf.config = parsedData;

		try {
			await setData(
				client,
				"config",
				userConf,
			); // Update existing raw config

			await interaction.reply({
				content: "Raw configuration has been updated successfully.",
				flags: [MessageFlags.Ephemeral],
			});
		} catch (error) {
			console.error(`Error updating raw user configuration: ${error}`);
			await interaction.reply({
				content: "There was an error updating your raw configuration.",
				flags: [MessageFlags.Ephemeral],
			});
		}
	} else if (subcommand === "getraw") {
		// Handling the 'getraw' subcommand
		await interaction.reply({
			content: `Raw configuration: \n\`\`\`json\n${
				JSON.stringify(
					userConf.config,
					null,
					2,
				)
			}\n\`\`\``,
			flags: [MessageFlags.Ephemeral],
		});
	}
}
