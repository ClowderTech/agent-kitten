import { Events, Client, GatewayIntentBits, Collection, REST, Routes, type Interaction, CommandInteraction, SlashCommandBuilder, EmbedBuilder, ApplicationCommand, type RESTGetAPIApplicationCommandsResult } from "discord.js";

import { config } from "dotenv";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

import { Connectors, Shoukaku } from "shoukaku";

import { Kazagumo } from "kazagumo";

import { type ClientExtended, UserMadeError } from "./classes.ts";

import { promises as fsPromises, read } from 'fs';

config({override: true});
if (!process.env.TOKEN || !process.env.LAVALINK_HOST || !process.env.LAVALINK_PASSWORD || !process.env.MONGODB_URI) {
    console.error("Please provide a token, lavalink host, lavalink password, and mongodb uri in a .env file or as environment variables.");
    process.exit(1);
}
// if (!process.env.TOKEN) {
//     console.error("Please provide a token in a .env file or as environment variables.");
//     process.exit(1);
// }

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

const client: ClientExtended = new Client(
    {
        intents: [
            GatewayIntentBits.AutoModerationConfiguration, 
            GatewayIntentBits.AutoModerationExecution, 
            GatewayIntentBits.DirectMessageReactions, 
            GatewayIntentBits.DirectMessageTyping, 
            GatewayIntentBits.DirectMessages, 
            GatewayIntentBits.GuildEmojisAndStickers, 
            GatewayIntentBits.GuildIntegrations, 
            GatewayIntentBits.GuildInvites, 
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessagePolls,
            GatewayIntentBits.GuildMessageReactions, 
            GatewayIntentBits.GuildMessageTyping, 
            GatewayIntentBits.GuildMessages, 
            GatewayIntentBits.GuildModeration, 
            GatewayIntentBits.GuildPresences, 
            GatewayIntentBits.GuildScheduledEvents, 
            GatewayIntentBits.GuildVoiceStates, 
            GatewayIntentBits.GuildWebhooks, 
            GatewayIntentBits.Guilds,
            GatewayIntentBits.MessageContent
        ],
    }
) as ClientExtended;

let nodes = [
    {
        name: "main",
        url: process.env.LAVALINK_HOST,
        auth: process.env.LAVALINK_PASSWORD,
        secure: true,
    }
];

client.kazagumo = new Kazagumo({
    defaultSearchEngine: "youtube",
    send: (guildId: string, payload: any) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    },
}, new Connectors.DiscordJS(client), nodes, {
    resumeByLibrary: true,
    reconnectInterval: 5000,
    reconnectTries: 12,
    moveOnDisconnect: true,
});


client.kazagumo.shoukaku.on('ready', (name) => console.log(`Lavalink ${name}: Ready!`));
client.kazagumo.shoukaku.on('error', (name, error) => console.error(`Lavalink ${name}: Error Caught,`, error));
client.kazagumo.shoukaku.on('close', (name, code, reason) => console.warn(`Lavalink ${name}: Closed, Code ${code}, Reason ${reason || 'No reason'}`));
client.kazagumo.shoukaku.on('debug', (name, info) => console.debug(`Lavalink ${name}: Debug,`, info));
client.kazagumo.shoukaku.on('disconnect', (name, count) => {
    const players = [...client.kazagumo.shoukaku.players.values()].filter(p => p.node.name === name);
    players.map(player => {
        client.kazagumo.destroyPlayer(player.guildId);
        player.destroy();
    });
    console.warn(`Lavalink ${name}: Disconnected`);
});

client.kazagumo.on("playerEmpty", player => {
    player.destroy();
});

client.commands = new Collection();

// client.moonlink = new MoonlinkManager(
//     [
//         {
//             host: process.env.LAVALINK_HOST,
//             port: Number(process.env.LAVALINK_PORT),
//             secure: true,
//             password: process.env.LAVALINK_PASSWORD,
//         }
//     ],
//     {
//         autoResume: true,
//     },
//     (guildID: any, sPayload: any) => {
//         client.guilds.cache.get(guildID)!.shard.send(JSON.parse(sPayload));
//     }
// );

// // Event: Node created
// client.moonlink.on("nodeCreate", node => {
//     console.log(`${node.host} was connected, and the magic is in the air`);
// });

// client.moonlink.on("nodeError", (node, error) => {
//     console.error(`Node ${node.host} emitted an error: ${error}`);
// });

// Check if file is valid JS or TS file
function checkForValidFile(file: string): boolean {
    const fileExtension = file.split(".").pop();
    return fileExtension === "js" || fileExtension === "ts";
}

// Asynchronously read files in a directory recursively
async function getAllFiles(dirPath: string): Promise<string[]> {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const fullPath = join(dirPath, entry.name);
        return entry.isDirectory() ? getAllFiles(fullPath) : [fullPath];
    }));
    return files.flat();
}

// Load commands from a directory and return them as an array of JSON
async function loadCommands(commandsPath: string): Promise<Record<string, any>[]> {
    const commandFiles = await getAllFiles(commandsPath);
    const commands = [];
    for (const file of commandFiles) {
        if (checkForValidFile(file)) {
            const command = await import(file);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
            } else {
                console.warn(`Warn: ${file} does not have the proper structure.`);
            }
        }
    }
    return commands;
}

// Load events from a directory
async function loadEvents(eventsPath: string) {
    const eventFiles = await getAllFiles(eventsPath);
    for (const file of eventFiles) {
        const event = await import(file);
        if (event.once) {
            client.once(event.eventType, (...args: any) => event.execute(...args));
        } else {
            client.on(event.eventType, (...args: any) => event.execute(...args));
        }
    }
}

const commandsPath = join(__dirname, "commands");
const devCommandsPath = join(__dirname, "devCommands");
const eventsPath = join(__dirname, "events");

// Load all commands and events
async function loadAll() {
    await loadCommands(commandsPath);
    await loadCommands(devCommandsPath);
    await loadEvents(eventsPath);
    console.log('Commands and events successfully loaded!');
}

loadAll().catch(console.error);

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error: any) {
        if (!(error instanceof UserMadeError)) {
            console.error(error);
        }

        let embed;

        if (error instanceof Error) {
            embed = new EmbedBuilder()
                .setTitle(`${error.name}: ${error.message}`)
                .setColor(0xff0000);
            if (interaction.guild && interaction.guild.id === '1185316093078802552') {
                embed = embed.setDescription(`\`\`\`${error.stack}\`\`\``)
            }

        } else {
            embed = new EmbedBuilder()
                .setTitle(`Error: ${error}`)
                .setColor(0xff0000);
        }

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
});

client.once(Events.ClientReady, async (readyClient: Client) => {
    console.log(`Logged in as ${readyClient.user?.tag}!`);

    const rest = new REST().setToken(client.token!);

    let commands = await readyClient.application?.commands.fetch();
    let devCommands = await readyClient.application?.commands.fetch({ guildId: "1185316093078802552" });
    let commandsName = commands?.map((command: ApplicationCommand) => command.name);
    let devCommandsName = devCommands?.map((command: ApplicationCommand) => command.name);
    let allCommands = commandsName?.concat(devCommandsName!)!;
    let registeredCommands = await rest.get(Routes.applicationCommands(readyClient.user!.id)) as RESTGetAPIApplicationCommandsResult;

    if (allCommands.length === registeredCommands.length && allCommands.every((command => registeredCommands.find(registeredCommand => registeredCommand.name === command)))) {
        const commandsPath = join(__dirname, "commands");
        const devCommandsPath = join(__dirname, "devCommands");

        const commands = await loadCommands(commandsPath);
        const devCommands = await loadCommands(devCommandsPath);

        try {
            console.log('Started refreshing application (/) commands.');

            await rest.put(
                Routes.applicationCommands(client.user!.id),
                { body: commands },
            );

            await rest.put(
                Routes.applicationGuildCommands(client.user!.id, '1185316093078802552'),
                { body: devCommands },
            );

            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error(error);
        }
    }
});

function gracefulShutdown() {
    console.log("Received shutdown signal, closing Discord client...");
    client.destroy()
        .then(() => {
            console.log("Discord client closed.");
            process.exit(0);
        })
        .catch(err => {
            console.error("Error closing Discord client:", err);
            process.exit(1);
        });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

client.login(process.env.TOKEN);
