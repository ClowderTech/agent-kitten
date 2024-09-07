import { Events, Client, GatewayIntentBits, Collection, REST, Routes, type Interaction, EmbedBuilder, ApplicationCommand, type RESTGetAPIApplicationCommandsResult, SlashCommandBuilder, type APIApplicationCommand, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import OpenAI from "openai";
import { Manager, Node, Player, type INode } from "moonlink.js";

import { type ClientExtended, type Command, UserMadeError } from "./classes.js";
import { MongoClient } from "mongodb";

import { promises as fsPromises } from 'fs';

import { ClusterClient, getInfo, type DjsDiscordClient } from "discord-hybrid-sharding";
import { Shard } from "discord-cross-hosting";

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
        shards: getInfo().SHARD_LIST,
        shardCount: getInfo().TOTAL_SHARDS,
    }
) as ClientExtended;

client.cluster = new ClusterClient(client as unknown as DjsDiscordClient);

client.machine = new Shard(client.cluster);

client.moonlink = new Manager({
    nodes: [
        {
            host: process.env.LAVALINK_HOST!,
            port: Number(process.env.LAVALINK_PORT),
            secure: Boolean(process.env.LAVALINK_SECURE!),
            password: process.env.LAVALINK_PASSWORD!,
            retryDelay: 5000,
            retryAmount: 1000000000000
        }
    ],
    options: {
    },
    sendPayload: (guildID: any, sPayload: any) => {
        client.guilds.cache.get(guildID)!.shard.send(JSON.parse(sPayload));
    }
}
);

// Event: Node created
client.moonlink.on("nodeCreate", (node: INode) => {
    console.log(`${node.host} was connected, and the magic is in the air`);
});

client.moonlink.on("nodeError", (node: INode, error: Error) => {
    console.error(`Node ${node.host} emitted an error: ${error}`);
});

client.moonlink.on("trackEnd", async (player: Player) => {
    const channel = await client.channels.cache.get(player.voiceChannelId);
    if (channel && channel.isVoiceBased() && channel.members.size === 1 && channel.members.has(client.user!.id)) {
        player.disconnect();
    }
});


client.commands = new Collection();
client.openai = new OpenAI({
    baseURL: "http://10.0.1.3:11434/v1"
});
client.mongoclient = new MongoClient(process.env.MONGODB_URI!);
client.mongoclient.connect();

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

async function loadCommands(commandsPath: string): Promise<Record<string, Command>> {
    // Step 1: Retrieve all command files
    const commandFiles = await getAllFiles(commandsPath);
    
    // Step 2: Initialize commands as an empty object instead of an empty array
    const commands: Record<string, Command> = {};  
    
    // Step 3: Loop through each file to check for valid commands
    for (const file of commandFiles) {
        // Step 4: Check if file has a valid command structure
        if (checkForValidFile(file)) {
            const command: Command = await import(file); // Dynamically import the command
            // Step 5: Verify that command has the required properties
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command); // Set command in client commands
                commands[command.data.name] = command; // Add command to the commands object
            } else {
                console.warn(`Warn: ${file} does not have the proper structure.`);
            }
        }
    }
    // Step 6: Return the populated commands object
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

function areCommandsRegistered(allCommands: SlashCommandBuilder[], registeredCommands: APIApplicationCommand[]): boolean {
    // Check if the lengths match
    if (allCommands.length !== registeredCommands.length) {
        return true; // Mismatch in length
    }

    // Compare commands
    for (const command of allCommands) {
        const actualCommand = command; // Use command properties

        // Find the corresponding registered command by name
        const registeredCommand = registeredCommands.find(registered => registered.name === actualCommand.name);

        if (!registeredCommand) {
            return true; // Command doesn't exist in registered
        }

        // Compare descriptions
        if (registeredCommand.description !== actualCommand.description) {
            return true; // Mismatch on description
        }

        // Compare options
        const actualOptions = actualCommand.options || [];
        const registeredOptions = registeredCommand.options || [];

        // Compare number of options
        if (actualOptions.length !== registeredOptions.length) {
            return true; // Mismatch on number of options
        }

        // Compare each option
        for (const option of actualOptions) {
            const actualOption = option.toJSON(); // Assuming the structure matches directly
            const registeredOption = registeredOptions.find(regOpt => regOpt.name === actualOption.name);

            if (!registeredOption) {
                return true; // Mismatch because option doesn't exist in registered
            }

            // Check each property of the option, with default for required
            const actualRequired = actualOption.required; // Get actual required value (true or false)
            const registeredRequired = registeredOption.required !== undefined ? registeredOption.required : false; // Assume false if undefined

            if (
                actualOption.name !== registeredOption.name ||
                actualOption.description !== registeredOption.description ||
                actualRequired !== registeredRequired || // Use our defined logic
                actualOption.type !== registeredOption.type
            ) {
                return true; // Option properties do not match
            }
        }
    }

    // If all checks pass, there are no mismatches
    return false; 
}

// Function to fetch all registered commands including guild commands
async function fetchRegisteredCommands(userId: string): Promise<APIApplicationCommand[]> {
    const rest = new REST().setToken(client.token!);

    // fetch global commands
    const globalCommands = await rest.get(Routes.applicationCommands(userId)) as APIApplicationCommand[];

    // fetch guild commands
    const guildCommands = await rest.get(Routes.applicationGuildCommands(userId, '1185316093078802552')) as APIApplicationCommand[];

    // Combine both global and guild commands
    return [...globalCommands, ...guildCommands];
}


// Usage in your client event
client.once(Events.ClientReady, async (readyClient: Client) => {
    console.log(`Logged in as ${readyClient.user?.tag}!`);

    const commandsPath = join(__dirname, "commands");
    const devCommandsPath = join(__dirname, "devCommands");

    const commands = await loadCommands(commandsPath);
    const devCommands = await loadCommands(devCommandsPath);
    const allCommands = { ...commands, ...devCommands };

    // Convert the allCommands object to an array of its values
    const allCommandsData = Object.values(allCommands).map(command => command.data);

    // Fetch all registered commands
    let registeredCommands = await fetchRegisteredCommands(readyClient.user!.id);

    // Proceed to use registeredCommands as needed...
    if (areCommandsRegistered(allCommandsData, registeredCommands)) {
        try {
            console.log('Detected mismatches in command definitions. Refreshing application (/) commands.');

            const rest = new REST().setToken(client.token!);

            await rest.put(
                Routes.applicationCommands(client.user!.id),
                { body: Object.values(commands).map(command => command.data.toJSON()) },
            );

            await rest.put(
                Routes.applicationGuildCommands(client.user!.id, '1185316093078802552'),
                { body: Object.values(devCommands).map(command => command.data.toJSON()) },
            );

            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error(error);
        }
    } else {
        console.log('No changes detected in registered commands.');
    }

    client.moonlink.init(client.user!.id);
});

client.on(Events.Raw, (packet: any) => {
    client.moonlink.packetUpdate(packet);
});

function gracefulShutdown() {
    console.log("Received shutdown signal, closing Discord client...");
    client.mongoclient.close();
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

client.login(process.env.BOT_TOKEN);