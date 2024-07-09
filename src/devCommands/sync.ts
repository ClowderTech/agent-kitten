import { SlashCommandBuilder, CommandInteraction, Collection, Message, REST, Routes } from "discord.js"

import { readdirSync } from "fs";

import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { createRequire } from "module";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

function checkForValidFile(file: string) {
    return file.split(".")[file.split(".").length - 1] === "js" || file.split(".")[file.split(".").length - 1] === "ts";
}

export const data = new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Sync the bot\'s commands with the commands folder.');

export async function execute(interaction: CommandInteraction) {
    const commands: Array<JSON> = [];
    const devCommands: Array<JSON> = [];

    const foldersPath = join(__dirname, "..", "commands");
    const commandFolders = readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandFiles = readdirSync(`${foldersPath}/${folder}`).filter(file => checkForValidFile(file));
        for (const file of commandFiles) {
            const command = await import(`${foldersPath}/${folder}/${file}`);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            } else {
                console.warn(`Warn: ${file} does not have the proper structure.`);
            }
        }
    }

    const devFoldersPath = join(__dirname, "..", "devCommands");
    const devCommandFiles = readdirSync(devFoldersPath).filter(file => checkForValidFile(file));

    for (const file of devCommandFiles) {
        const command = await import(`${devFoldersPath}/${file}`);
        if ('data' in command && 'execute' in command) {
            devCommands.push(command.data.toJSON());
        } else {
            console.warn(`Warn: ${file} does not have the proper structure.`);
        }
    }

    const rest = new REST().setToken(interaction.client.token);

    (async () => {
        try {
            console.log('Started refreshing application (/) commands.');

            await rest.put(
                Routes.applicationCommands(interaction.client.user.id),
                { body: commands },
            );

            await rest.put(
                Routes.applicationGuildCommands(interaction.client.user.id, '1185316093078802552'),
                { body: devCommands },
            );

            console.log('Successfully reloaded application (/) commands.');
        }
        catch (error) {
            console.error(error);
        }
    })();

    interaction.reply(`Synced ${commands.length + devCommands.length} commands.`);
};