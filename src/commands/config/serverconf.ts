import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	PermissionsBitField,
	SlashCommandBuilder,
} from "discord.js";
import type { ClientExtended } from "../../utils/classes.ts";
import { ObjectId } from "mongodb";
import { getData, setData } from "../../utils/mongohelper.ts"; // Adjust the import path as necessary
import {
	getNestedKey,
	type ServerConfig,
	setNestedKey,
} from "../../utils/config.ts";

export const data = new SlashCommandBuilder()
	.setName("serverconf")
	.setDescription("Manage your server configuration options.")
	.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("set")
			.setDescription("Set a server configuration option.")
			.addStringOption((option) =>
				option
					.setName("key")
					.setDescription("The configuration key you want to set")
					.setRequired(true)
					.addChoices([
						{
							name: "moderation.automod.enabled",
							value: "moderation.automod.enabled",
						},
						{
							name: "music.maxvolume",
							value: "music.maxvolume",
						},
						{
							name: "moderation.automod.lookback",
							value: "moderation.automod.lookback",
						},
						{
							name: "moderation.automod.logchannel",
							value: "moderation.automod.logchannel",
						},
						{
							name: "moderation.automod.bypassrole",
							value: "moderation.automod.bypassrole",
						},
						{
							name: "moderation.automod.disabledcategories",
							value: "moderation.automod.disabledcategories",
						},
						{
							name: "leveling.expmultiplier",
							value: "leveling.expmultiplier",
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
			.setDescription("Get a server configuration option.")
			.addStringOption((option) =>
				option
					.setName("key")
					.setDescription("The configuration key you want to get")
					.setRequired(true)
					.addChoices([
						{
							name: "moderation.automod.enabled",
							value: "moderation.automod.enabled",
						},
						{
							name: "music.maxvolume",
							value: "music.maxvolume",
						},
						{
							name: "moderation.automod.lookback",
							value: "moderation.automod.lookback",
						},
						{
							name: "moderation.automod.logchannel",
							value: "moderation.automod.logchannel",
						},
						{
							name: "moderation.automod.bypassrole",
							value: "moderation.automod.bypassrole",
						},
						{
							name: "moderation.automod.disabledcategories",
							value: "moderation.automod.disabledcategories",
						},
						{
							name: "leveling.expmultiplier",
							value: "leveling.expmultiplier",
						},
					])
			)
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("setraw")
			.setDescription("Set the raw server configuration.")
			.addStringOption((option) =>
				option
					.setName("value")
					.setDescription(
						"The raw configuration value as a JSON string"
					)
					.setRequired(true)
			)
	) // New raw set command
	.addSubcommand((subcommand) =>
		subcommand
			.setName("getraw")
			.setDescription("Get the entire raw server configuration.")
	); // New raw get command

export async function execute(interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		await interaction.reply({ content: "This was not sent in a server." });
		return;
	}

	const serverId = interaction.guild.id; // Get the ID of the server executing the command
	const client = interaction.client as ClientExtended;

	const serverData = (await getData(client, "config", {
		serverid: serverId,
	})) as ServerConfig[];
	let serverConf: ServerConfig;
	if (serverData.length > 0) {
		serverConf = serverData[0];
	} else {
		serverConf = {
			_id: new ObjectId(),
			config: {},
			serverid: serverId,
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

		serverConf.config = setNestedKey(serverConf.config, key, parsedValue);

		try {
			await setData(client, "config", serverConf);

			const embed = new EmbedBuilder()
				.setTitle("Server Configuration Updated")
				.setColor(0x9a2d7d)
				.setTimestamp()
				.addFields(
					{ name: "Your Key", value: key, inline: true },
					{ name: "New Value", value: value }
				);

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			console.error(`Error updating server configuration: ${error}`);
			await interaction.reply({
				content: "There was an error updating your configuration.",
			});
		}
	} else if (subcommand === "get") {
		// Handling the 'get' subcommand
		const key = interaction.options.getString("key", true); // Optional key
		// If a key is specified, return its value

		const value = getNestedKey(serverConf.config, key);

		if (value) {
			await interaction.reply({
				content: `Value for \`${key}\`: ${value}`,
			});
		} else {
			await interaction.reply({ content: `Key \`${key}\` not found.` });
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
			});
			return;
		}

		serverConf.config = parsedData;

		try {
			await setData(client, "config", serverConf);

			await interaction.reply({
				content: "Raw configuration has been updated successfully.",
			});
		} catch (error) {
			console.error(`Error updating raw server configuration: ${error}`);
			await interaction.reply({
				content: "There was an error updating your raw configuration.",
			});
		}
	} else if (subcommand === "getraw") {
		// Handling the 'getraw' subcommand
		await interaction.reply({
			content: `Raw configuration: \n\`\`\`json\n${JSON.stringify(
				serverConf.config,
				null,
				2
			)}\n\`\`\``,
		});
	}
}
