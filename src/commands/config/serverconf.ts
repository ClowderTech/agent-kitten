import { EmbedBuilder, SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField } from "discord.js";
import type { ClientExtended } from "../../utils/classes.ts";
import { getData, setData } from "../../utils/mongohelper.ts"; // Adjust the import path as necessary
import { setNestedKey, getNestedKey, type Config } from "../../utils/config.ts";

export const data = new SlashCommandBuilder()
    .setName('serverconf')
    .setDescription('Manage your server configuration options.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('set')
            .setDescription('Set a server configuration option.')
            .addStringOption(option =>
                option.setName('key')
                    .setDescription('The configuration key you want to set')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('value')
                    .setDescription('The configuration value to set')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('get')
            .setDescription('Get a server configuration option.')
            .addStringOption(option =>
                option.setName('key')
                    .setDescription('The configuration key you want to get')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('setraw')
            .setDescription('Set the raw server configuration.')
            .addStringOption(option =>
                option.setName('value')
                    .setDescription('The raw configuration value as a JSON string')
                    .setRequired(true))) // New raw set command
    .addSubcommand(subcommand =>
        subcommand
            .setName('getraw')
            .setDescription('Get the entire raw server configuration.')); // New raw get command

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
        await interaction.reply({ content: "This was not sent in a server." });
        return;
    }

    const serverId = interaction.guild.id; // Get the ID of the server executing the command
    const client = interaction.client as ClientExtended;

    const serverData = await getData(client, 'config', { serverId: serverId });
    const oldConfigData: Config = serverData[0]?.config || {};

    // Determine which subcommand is called
    const subcommand = interaction.options.getSubcommand(); // Get subcommand directly

    if (subcommand === 'set') {
        const key = interaction.options.getString('key', true);
        const value = interaction.options.getString('value', true);

        let parsedValue: string | number | boolean;
        try {
            parsedValue = JSON.parse(value); // Attempt to parse it
        } catch {
            parsedValue = value; // If parsing fails, keep it as a string
        }

        const configData = {
            serverId: serverId,
            config: setNestedKey({ ...oldConfigData }, key, parsedValue)
        };

        try {
            if (serverData.length > 0) {
                await setData(client, 'config', configData, serverData[0]._id); // Update existing config
            } else {
                await setData(client, 'config', configData); // Insert new config
            }

            const embed = new EmbedBuilder()
                .setTitle('Server Configuration Updated')
                .setColor("#2b2d31")
                .setTimestamp()
                .addFields(
                    { name: 'Your Key', value: key, inline: true },
                    { name: 'New Value', value: value }
                );

            await interaction.reply({ embeds: [embed]});
        } catch (error) {
            console.error(`Error updating server configuration: ${error}`);
            await interaction.reply({ content: 'There was an error updating your configuration.'});
        }
    } else if (subcommand === 'get') { // Handling the 'get' subcommand
        const key = interaction.options.getString('key', true) as string; // Optional key
        // If a key is specified, return its value

        const value = getNestedKey(oldConfigData, key)

        if (value) {
            await interaction.reply({ content: `Value for \`${key}\`: ${value}`});
        } else {
            await interaction.reply({ content: `Key \`${key}\` not found.`});
        }
    } else if (subcommand === 'setraw') { // Handling the 'setraw' subcommand
        const rawValue = interaction.options.getString('value', true);
        let parsedData;

        try {
            parsedData = JSON.parse(rawValue); // Parse the raw JSON string
        } catch {
            await interaction.reply({ content: 'Invalid JSON format. Please provide a valid JSON string.'});
            return;
        }

        const configData = {
            serverId: serverId,
            config: parsedData // Set to the parsed JSON object
        };

        try {
            if (serverData.length > 0) {
                await setData(client, 'config', configData, serverData[0]._id); // Update existing raw config
            } else {
                await setData(client, 'config', configData); // Insert new raw config
            }

            await interaction.reply({ content: 'Raw configuration has been updated successfully.'});
        } catch (error) {
            console.error(`Error updating raw server configuration: ${error}`);
            await interaction.reply({ content: 'There was an error updating your raw configuration.'});
        }
    } else if (subcommand === 'getraw') { // Handling the 'getraw' subcommand
        await interaction.reply({ content: `Raw configuration: \n\`\`\`json\n${JSON.stringify(oldConfigData, null, 2)}\n\`\`\``});
    }
}