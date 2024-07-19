import { Events, Client, GatewayIntentBits, Collection, REST, Routes, type Interaction, CommandInteraction, SlashCommandBuilder, EmbedBuilder, ApplicationCommand } from "discord.js";

import { readdirSync } from "fs";

import { config } from "dotenv";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

import { createRequire } from "module";
import OpenAI from "openai";
import { MoonlinkManager } from "moonlink.js";

import { type ClientExtended, UserMadeError } from "./classes.ts";
import { MongoClient } from "mongodb";

config({override: true});
// if (!process.env.TOKEN || !process.env.LAVALINK_HOST || !process.env.LAVALINK_PASSWORD || !process.env.LAVALINK_PORT) {
//     console.error("Please provide a token, lavalink host, and lavalink password in a .env file or as environment variables.");
//     process.exit(1);
// }
if (!process.env.TOKEN) {
    console.error("Please provide a token in a .env file or as environment variables.");
    process.exit(1);
}

const require = createRequire(import.meta.url);

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

client.moonlink = new MoonlinkManager(
    [
        {
            host: process.env.LAVALINK_HOST!,
            port: Number(process.env.LAVALINK_PORT),
            secure: true,
            password: process.env.LAVALINK_PASSWORD!,
        }
    ],
    {
        autoResume: true,
    },
    (guildID: any, sPayload: any) => {
        client.guilds.cache.get(guildID)!.shard.send(JSON.parse(sPayload));
    }
);

// Event: Node created
client.moonlink.on("nodeCreate", node => {
    console.log(`${node.host} was connected, and the magic is in the air`);
});

client.moonlink.on("nodeError", (node, error) => {
    console.error(`Node ${node.host} emitted an error: ${error}`);
});

client.commands = new Collection();
client.openai = new OpenAI({
    // baseURL: "https://ollama.clowdertech.com/v1"
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

const commandsPath = join(__dirname, "commands");
const commandFolders = readdirSync(commandsPath);

function checkForValidFile(file: string) {
    return file.split(".")[file.split(".").length - 1] === "js" || file.split(".")[file.split(".").length - 1] === "ts";
}

for (const folder of commandFolders) {
    const commandFiles = readdirSync(join(commandsPath, folder)).filter(file => checkForValidFile(file));
    for (const file of commandFiles) {
        const command = await import(join(commandsPath, folder, file));
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.warn(`Warn: ${file} does not have the proper structure.`);
        }
    }
}

const devCommandsPath = join(__dirname, "devCommands");
const devCommandsFiles = readdirSync(devCommandsPath).filter(file => checkForValidFile(file));

for (const file of devCommandsFiles) {
    const command = await import(join(devCommandsPath, file));
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.warn(`Warn: ${file} does not have the proper structure.`);
    }
}

const eventsPath = join(__dirname, "events");
const eventFiles = readdirSync(eventsPath).filter(file => checkForValidFile(file));

for (const file of eventFiles) {
	const event = await import(join(eventsPath, file));
	if (event.once) {
		client.once(event.eventType, (...args: any) => event.execute(...args));
	} else {
		client.on(event.eventType, (...args: any) => event.execute(...args));
	}
}



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

    let commands = await readyClient.application?.commands.fetch();
    let devCommands = await readyClient.application?.commands.fetch({guildId: "1185316093078802552"});
    let commandsName = commands?.map((commands: ApplicationCommand) => commands.name);
    let devCommandsName = devCommands?.map((commands: ApplicationCommand) => commands.name);
    let allCommands = commandsName?.concat(devCommandsName!);

    if ((allCommands?.length === 0) || (allCommands?.length !== client.commands.size) || !(allCommands?.every(item => client.commands.has(item))) || !(allCommands?.find((value) => value === "sync"))) {
        const commands: Array<JSON> = [];
        const devCommands: Array<JSON> = [];

        const commandsPath = join(__dirname, "commands");
        const commandFolders = readdirSync(commandsPath);

        for (const folder of commandFolders) {
            const commandFiles = readdirSync(join(commandsPath, folder)).filter(file => checkForValidFile(file));
            for (const file of commandFiles) {
                const command = await import(join(commandsPath, folder, file));
                if ('data' in command && 'execute' in command) {
                    commands.push(command.data.toJSON());
                } else {
                    console.warn(`Warn: ${file} does not have the proper structure.`);
                }
            }
        }

        const devCommandsPath = join(__dirname, "devCommands");
        const devCommandsFiles = readdirSync(devCommandsPath).filter(file => checkForValidFile(file));

        for (const file of devCommandsFiles) {
            const command = await import(join(devCommandsPath, file));
            if ('data' in command && 'execute' in command) {
                devCommands.push(command.data.toJSON());
            } else {
                console.warn(`Warn: ${file} does not have the proper structure.`);
            }
        }

        const rest = new REST().setToken(client.token!);

        (async () => {
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
            }
            catch (error) {
                console.error(error);
            }
        })();
    }

    client.moonlink.init(client.user?.id);
});

client.on(Events.Raw, (packet: any) => {
    client.moonlink.packetUpdate(packet);
});

function gracefulShutdown() {
    console.log("Received shutdown signal, closing Discord client...");
    client.mongoclient.close();
    client.openai;
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
