import {
	type APIApplicationCommand,
	ChannelType,
	Client,
	Collection,
	EmbedBuilder,
	Events,
	GatewayIntentBits,
	Guild,
	type Interaction,
	MessageFlags,
	REST,
	Routes,
	SlashCommandBuilder,
	StageChannel,
	VoiceChannel,
} from "discord.js";

import { Manager } from "moonlink.js";

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
		GatewayIntentBits.DirectMessagePolls,
		GatewayIntentBits.DirectMessageReactions,
		GatewayIntentBits.DirectMessageTyping,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.GuildExpressions,
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
			host: process.env.LAVALINK_HOST!, // lavalink.clowdertech.com
			port: parseInt(process.env.LAVALINK_PORT!, 10), // 443
			secure: Boolean(process.env.LAVALINK_SECURE!), // true
			password: process.env.LAVALINK_PASSWORD!, // ImGay69
			retryDelay: 5000,
			retryAmount: 4294967295,
		},
	],
	options: {
		defaultPlatformSearch: "youtubemusic",
		autoResume: true,
	},
	sendPayload: (guildId: string, payload: string) => {
		const guild = client.guilds.cache.get(guildId);
		if (guild) guild.shard.send(JSON.parse(payload)); // Sending data to the shard if the guild is available
	},
});

client.moonlink.on("nodeError", (node, error) => {
	console.error(`Node ${node.host} emitted an error: ${error}`);
});

const headers = {
	Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
} as HeadersInit;

client.commands = new Collection();
client.ollama = new Ollama({
	host: process.env.OPENAI_BASE_URL!,
	headers: headers,
});
client.mongoclient = new MongoClient(process.env.MONGODB_URI!);
client.mongoclient.connect();

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
		})
	);
	return files.flat();
}

async function loadCommands(
	commandsPath: string
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
					`Warn: ${file} does not have the proper structure.`
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
						args
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
						args
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
				.setTitle(`${error.name}: ${error.message}`.substring(0, 255))
				.setColor(0x9a2d7d);
			if (
				interaction.guild &&
				interaction.guild.id === "1185316093078802552"
			) {
				embed = embed.setDescription(
					`\`\`\`${error.stack?.substring(0, 4085)}\`\`\``
				);
			}
		} else {
			embed = new EmbedBuilder()
				.setTitle(`Error: ${error}`.substring(0, 255))
				.setColor(0x9a2d7d);
		}

		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				embeds: [embed],
				flags: [MessageFlags.Ephemeral],
			});
		} else {
			await interaction.reply({
				embeds: [embed],
				flags: [MessageFlags.Ephemeral],
			});
		}
	}
});

function areCommandsRegistered(
	allCommands: SlashCommandBuilder[],
	registeredCommands: APIApplicationCommand[]
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
			(registered) => registered.name === actualCommand.name
		);

		if (!registeredCommand) {
			console.log(`Command ${actualCommand.name} not registered`);
			return true; // Command doesn't exist in registered
		}

		// Compare descriptions
		if (registeredCommand.description !== actualCommand.description) {
			console.log(
				`Command description mismatch for command ${actualCommand.name}: expected "${actualCommand.name}", got "${registeredCommand.name}"`
			);
			return true; // Mismatch on description
		}

		// Compare options
		const actualOptions = actualCommand.options || [];
		const registeredOptions = registeredCommand.options || [];

		// Compare number of options
		if (actualOptions.length !== registeredOptions.length) {
			console.log(
				`Options length mismatch for command ${actualCommand.name}: expected "${actualOptions.length}", got "${registeredOptions.length}"`
			);
			return true; // Mismatch on number of options
		}

		// Compare each option
		for (const option of actualOptions) {
			const actualOption = option.toJSON(); // Assuming the structure matches directly
			const registeredOption = registeredOptions.find(
				(regOpt) => regOpt.name === actualOption.name
			);

			if (!registeredOption) {
				console.log(
					`Option ${actualOption.name} not registered for command ${actualCommand.name}`
				);
				return true; // Mismatch because option doesn't exist in registered
			}

			// Check each property of the option, with default for required
			const actualRequired =
				actualOption.required !== undefined
					? actualOption.required
					: false; // Get actual required value (true or false)
			const registeredRequired =
				registeredOption.required !== undefined
					? registeredOption.required
					: false; // Assume false if undefined

			if (actualOption.name !== registeredOption.name) {
				console.log(
					`Option name mismatch for command ${actualCommand.name}: expected "${actualOption.name}", got "${registeredOption.name}"`
				);
				return true;
			}
			if (actualOption.description !== registeredOption.description) {
				console.log(
					`Option ${actualOption.name} description mismatch for command ${actualCommand.name}: expected "${actualOption.description}", got "${registeredOption.description}"`
				);
				return true;
			}

			if (actualOption.type !== registeredOption.type) {
				console.log(
					`Option ${actualOption.name} type mismatch for command ${actualCommand.name}: expected "${actualOption.type}", got "${registeredOption.type}"`
				);
				return true;
			}

			if (actualRequired !== registeredRequired) {
				console.log(
					`Option ${actualOption.name} required mismatch for command ${actualCommand.name}: expected "${actualRequired}", got "${registeredRequired}"`
				);
				return true;
			}
		}
	}

	// If all checks pass, there are no mismatches
	return false;
}

// Function to fetch all registered commands including guild commands
async function fetchRegisteredCommands(
	userId: string
): Promise<APIApplicationCommand[]> {
	const rest = new REST().setToken(client.token!);

	// fetch global commands
	const globalCommands = (await rest.get(
		Routes.applicationCommands(userId)
	)) as APIApplicationCommand[];

	// fetch guild commands
	const guildCommands = (await rest.get(
		Routes.applicationGuildCommands(userId, "1185316093078802552")
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
		(command) => command.data
	);

	// Fetch all registered commands
	const registeredCommands = await fetchRegisteredCommands(
		readyClient.user!.id
	);

	// Proceed to use registeredCommands as needed...
	if (areCommandsRegistered(allCommandsData, registeredCommands)) {
		try {
			console.log(
				"Detected mismatches in command definitions. Refreshing application (/) commands."
			);

			const rest = new REST().setToken(client.token!);

			await rest.put(Routes.applicationCommands(client.user!.id), {
				body: Object.values(commands).map((command) =>
					command.data.toJSON()
				),
			});

			await rest.put(
				Routes.applicationGuildCommands(
					client.user!.id,
					"1185316093078802552"
				),
				{
					body: Object.values(devCommands).map((command) =>
						command.data.toJSON()
					),
				}
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
			channel.type === ChannelType.GuildStageVoice
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
					await prettyExpGain(client, member.user, guild, channel);
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
	client.ollama.abort();
	client
		.destroy()
		.then(() => {
			console.log("Discord client closed.");
			process.exit(0);
		})
		.catch((err) => {
			console.error("Error closing Discord client:", err);
			process.exit(1);
		});
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

client.login(process.env.DISCORD_TOKEN!);
