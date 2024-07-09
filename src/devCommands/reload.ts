import { EmbedBuilder, CommandInteraction, SlashCommandBuilder, User, Team, Collection, SlashCommandStringOption} from "discord.js";

import { readdirSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

import { createRequire } from "module";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

function checkForValidFile(file: string) {
    return file.split(".")[file.split(".").length - 1] === "js" || file.split(".")[file.split(".").length - 1] === "ts";
}

export const data = new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Hot reload a command.')
        .addStringOption((option: SlashCommandStringOption) => option.setName('command').setDescription('The command to reload.').setRequired(true));

export async function execute(interaction: CommandInteraction) {
    if (!("commands" in interaction.client)) {
        await interaction.reply({ content: "The bot is not ready to reload commands.", ephemeral: true });
        return;
    } else if (!(interaction.client.commands instanceof Collection)) {
        await interaction.reply({ content: "The bot is not ready to reload commands.", ephemeral: true });
        return;
    }

    const commandName = interaction.options.get('command', true).value;
    const command = interaction.client.commands.get(commandName);

    if (!command) {
        await interaction.reply({ content: "The command does not exist.", ephemeral: true });
        return;
    }

    const foldersPath = `${__dirname}/../commands`;
    const commandFolders = readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandFiles = readdirSync(`${foldersPath}/${folder}`).filter(file => checkForValidFile(file));
        for (const file of commandFiles) {
            const command = await import(`${foldersPath}/${folder}/${file}`);
            if ('data' in command && 'execute' in command) {
                if (commandName === command.data.name) {
                    delete require.cache[require.resolve(`${foldersPath}/${folder}/${file}`)];
    
                    try {
                        interaction.client.commands.delete(command.data.name);
                        const newCommand = require(`${foldersPath}/${folder}/${file}`);
                        interaction.client.commands.set(newCommand.data.name, newCommand);
                        await interaction.reply(`Command \`${newCommand.data.name}\` was reloaded!`);
                        return;
                    } catch (error: any) {
                        console.error(error);
                        await interaction.reply(`There was an error while reloading a command \`${command.data.name}\`:\n\`\`\`${error.message}\`\`\``);
                        return;
                    }
                }
            }
        }
    }

    const devFoldersPath = `${__dirname}/../devCommands`;
    const devCommandFiles = readdirSync(devFoldersPath).filter(file => checkForValidFile(file));

    for (const file of devCommandFiles) {
        const command = await import(`${devFoldersPath}/${file}`);
        if ('data' in command && 'execute' in command) {
            if (commandName === command.data.name) {
                delete require.cache[require.resolve(`${devFoldersPath}/${file}`)];

                try {
                    interaction.client.commands.delete(command.data.name);
                    const newCommand = require(`${devFoldersPath}/${file}`);
                    interaction.client.commands.set(newCommand.data.name, newCommand);
                    await interaction.reply(`Command \`${newCommand.data.name}\` was reloaded!`);
                    return;
                } catch (error: any) {
                    console.error(error);
                    await interaction.reply(`There was an error while reloading a command \`${command.data.name}\`:\n\`\`\`${error.message}\`\`\``);
                    return;
                }
            }
        }
    }
};