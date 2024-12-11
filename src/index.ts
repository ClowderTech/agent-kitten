import {
	Events,
	Client,
	GatewayIntentBits,
	Collection,
	REST,
	Routes,
	type Interaction,
	EmbedBuilder,
	SlashCommandBuilder,
	type APIApplicationCommand,
	Guild,
	ChannelType,
	VoiceChannel,
	StageChannel,
} from "discord.js";

import { Manager, Player } from "moonlink.js";

import {
	type ClientExtended,
	type Command,
	UserMadeError,
} from "./utils/classes.ts";
import { MongoClient } from "mongodb";

import { promises as fsPromises } from "node:fs";

import { Ollama } from "ollama";

import { join } from "node:path";
import { prettyExpGain } from "./utils/leveling.ts";

const client: ClientExtended = new Client({
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
		GatewayIntentBits.GuildScheduledEvents,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildWebhooks,
		GatewayIntentBits.Guilds,
		GatewayIntentBits.MessageContent,
	],
}) as ClientExtended;

client.usersMessaged = [];

client.moonlink = new Manager({
    nodes: [
        {
            host: Deno.env.get("LAVALINK_HOST")!, // lavalink.clowdertech.com
            port: Number(Deno.env.get("LAVALINK_PORT")), // 443
            secure: Boolean(Deno.env.get("LAVALINK_SECURE")!), // true
            password: Deno.env.get("LAVALINK_PASSWORD")!, // ImGay69
            retryDelay: 5000,
            retryAmount: 65535,
            identifier: "main",
        },
    ],
    options: {
        NodeLinkFeatures: true,
        previousInArray: true,
    },
    sendPayload: (guildId: string, payload: string) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(JSON.parse(payload)); // Sending data to the shard if the guild is available
    },
});

client.moonlink.on("debug", (message) => console.log("[DEBUG]", message));

// Event: Node created
client.moonlink.on("nodeCreate", (node) => {
	console.log(`${node.host} was connected, and the magic is in the air`);
});

client.moonlink.on("nodeError", (node, error) => {
	console.error(`Node ${node.host} emitted an error: ${error}`);
});

client.moonlink.on("trackEnd", async (player: Player) => {
	const channel =
		client.channels.cache.get(player.voiceChannelId) ||
		(await client.channels.fetch(player.voiceChannelId));
	if (
		channel &&
		channel.isVoiceBased() &&
		channel.members.size === 1 &&
		channel.members.has(client.user!.id)
	) {
		player.disconnect();
	}
});

client.commands = new Collection();
client.ollama = new Ollama({
	host: "https://ollama.clowdertech.com",
});
client.mongoclient = new MongoClient(Deno.env.get("MONGODB_URI")!);
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
	const files = await Promise.all(
		entries.map((entry) => {
			const fullPath = join(dirPath, entry.name);
			return entry.isDirectory() ? getAllFiles(fullPath) : [fullPath];
		}),
	);
	return files.flat();
}

async function loadCommands(
	commandsPath: string,
): Promise<Record<string, Command>> {
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
			if ("data" in command && "execute" in command) {
				client.commands.set(command.data.name, command); // Set command in client commands
				commands[command.data.name] = command; // Add command to the commands object
			} else {
				console.warn(
					`Warn: ${file} does not have the proper structure.`,
				);
			}
		}
	}
	// Step 6: Return the populated commands object
	return commands;
}

async function loadEvents(eventsPath: string): Promise<void> {
	const eventFiles = await getAllFiles(eventsPath);

	for (const file of eventFiles) {
		const event = await import(file);

		if (event.once) {
			client.once(event.eventType, async (...args) => {
				if (args && Array.isArray(args)) {
					try {
						await event.execute(...args);
					} catch (error: unknown) {
						console.error(error);
					}
				} else {
					console.error(
						"Expected args to be an array, but received:",
						args,
					);
				}
			});
		} else {
			client.on(event.eventType, async (...args) => {
				if (args && Array.isArray(args)) {
					try {
						await event.execute(...args);
					} catch (error: unknown) {
						console.error(error);
					}
				} else {
					console.error(
						"Expected args to be an array, but received:",
						args,
					);
				}
			});
		}
	}
}

const commandsPath = join(import.meta.dirname!, "commands");
const devCommandsPath = join(import.meta.dirname!, "devCommands");
const eventsPath = join(import.meta.dirname!, "events");

// Load all commands and events
async function loadAll() {
	await loadCommands(commandsPath);
	await loadCommands(devCommandsPath);
	await loadEvents(eventsPath);
	console.log("Commands and events successfully loaded!");
}

loadAll().catch(console.error);

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
	if (!interaction.isCommand()) return;
	if (!interaction.isChatInputCommand()) return;

	const command = client.commands.get(interaction.commandName);

	if (!command) return;

	try {
		await command.execute(interaction);
	} catch (error: unknown) {
		if (!(error instanceof UserMadeError)) {
			console.error(error);
		}

		let embed;

		if (error instanceof Error) {
			embed = new EmbedBuilder()
				.setTitle(`${error.name}: ${error.message}`)
				.setColor(0xff0000);
			if (
				interaction.guild &&
				interaction.guild.id === "1185316093078802552"
			) {
				embed = embed.setDescription(`\`\`\`${error.stack}\`\`\``);
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

function areCommandsRegistered(
	allCommands: SlashCommandBuilder[],
	registeredCommands: APIApplicationCommand[],
): boolean {
	// Check if the lengths match
	if (allCommands.length !== registeredCommands.length) {
		return true; // Mismatch in length
	}

	// Compare commands
	for (const command of allCommands) {
		const actualCommand = command; // Use command properties

		// Find the corresponding registered command by name
		const registeredCommand = registeredCommands.find(
			(registered) => registered.name === actualCommand.name,
		);

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
			const registeredOption = registeredOptions.find(
				(regOpt) => regOpt.name === actualOption.name,
			);

			if (!registeredOption) {
				return true; // Mismatch because option doesn't exist in registered
			}

			// Check each property of the option, with default for required
			const actualRequired =
				actualOption.required !== undefined
					? registeredOption.required
					: false; // Get actual required value (true or false)
			const registeredRequired =
				registeredOption.required !== undefined
					? registeredOption.required
					: false; // Assume false if undefined

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
async function fetchRegisteredCommands(
	userId: string,
): Promise<APIApplicationCommand[]> {
	const rest = new REST().setToken(client.token!);

	// fetch global commands
	const globalCommands = (await rest.get(
		Routes.applicationCommands(userId),
	)) as APIApplicationCommand[];

	// fetch guild commands
	const guildCommands = (await rest.get(
		Routes.applicationGuildCommands(userId, "1185316093078802552"),
	)) as APIApplicationCommand[];

	// Combine both global and guild commands
	return [...globalCommands, ...guildCommands];
}

// Usage in your client event
client.once(Events.ClientReady, async (readyClient: Client) => {
	console.log(`Logged in as ${readyClient.user?.tag}!`);

	const commandsPath = join(import.meta.dirname!, "commands");
	const devCommandsPath = join(import.meta.dirname!, "devCommands");

	const commands = await loadCommands(commandsPath);
	const devCommands = await loadCommands(devCommandsPath);
	const allCommands = { ...commands, ...devCommands };

	// Convert the allCommands object to an array of its values
	const allCommandsData = Object.values(allCommands).map(
		(command) => command.data,
	);

	// Fetch all registered commands
	const registeredCommands = await fetchRegisteredCommands(
		readyClient.user!.id,
	);

	// Proceed to use registeredCommands as needed...
	if (areCommandsRegistered(allCommandsData, registeredCommands)) {
		try {
			console.log(
				"Detected mismatches in command definitions. Refreshing application (/) commands.",
			);

			const rest = new REST().setToken(client.token!);

			await rest.put(Routes.applicationCommands(client.user!.id), {
				body: Object.values(commands).map((command) =>
					command.data.toJSON(),
				),
			});

			await rest.put(
				Routes.applicationGuildCommands(
					client.user!.id,
					"1185316093078802552",
				),
				{
					body: Object.values(devCommands).map((command) =>
						command.data.toJSON(),
					),
				},
			);

			console.log("Successfully reloaded application (/) commands.");
		} catch (error) {
			console.error(error);
		}
	} else {
		console.log("No changes detected in registered commands.");
	}

	client.moonlink.init(client.user!.id);
});

client.on("raw", (d) => client.moonlink.packetUpdate(d));

async function getVoiceChannelMembers(guild: Guild) {
	// Get all voice and stage channels in the guild
	const voiceChannels = guild.channels.cache.filter(
		(channel) =>
			channel.type === ChannelType.GuildVoice ||
			channel.type === ChannelType.GuildStageVoice,
	);

	for (const channelArray of voiceChannels) {
		const channel = channelArray[1];

		if (
			channel instanceof VoiceChannel ||
			channel instanceof StageChannel
		) {
			for (const member of channel.members.values()) {
				if (
					!member.voice.selfDeaf &&
					!member.voice.mute &&
					!(member.voice.channelId === member.guild.afkChannelId)
				) {
					await prettyExpGain(client, member.user);
				}
			}
		}
	}
}

// Set the interval to run the function for each guild
setInterval(() => {
	client.guilds.cache.forEach((guild) => {
		// Iterate through each guild the bot is in
		getVoiceChannelMembers(guild); // Call function for each guild
	});
}, 60000); // 60000 milliseconds = 1 minute

setInterval(() => {
	client.usersMessaged = [];
}, 60000);

function gracefulShutdown() {
	console.log("Received shutdown signal, closing Discord client...");
	client.mongoclient.close();
	client
		.destroy()
		.then(() => {
			console.log("Discord client closed.");
			Deno.exit(0);
		})
		.catch((err) => {
			console.error("Error closing Discord client:", err);
			Deno.exit(1);
		});
}

Deno.addSignalListener("SIGINT", gracefulShutdown);
Deno.addSignalListener("SIGTERM", gracefulShutdown);

client.login(Deno.env.get("DISCORD_TOKEN"));
