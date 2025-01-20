import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import process from "node:process";

export const data = new SlashCommandBuilder()
	.setName("debug")
	.setDescription("Show debug information about the bot.");

function convertMillisToHumanReadable(millis: number): string {
	const units = [
		{ name: "day", value: 24 * 60 * 60 * 1000 },
		{ name: "hour", value: 60 * 60 * 1000 },
		{ name: "minute", value: 60 * 1000 },
		{ name: "second", value: 1000 },
	];

	for (const unit of units) {
		if (millis >= unit.value) {
			const amount = Math.floor(millis / unit.value);
			return `${amount} ${unit.name}${amount !== 1 ? "s" : ""}`;
		}
	}

	// If no unit is found, it's less than a second
	return "less than a second";
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
}

export async function execute(interaction: ChatInputCommandInteraction) {
	const client = interaction.client;

	const embed: EmbedBuilder = new EmbedBuilder()
		.setTitle("Debug Information")
		.setColor(0x9a2d7d) // Purple-ish pink color
		.setTimestamp()
		.addFields(
			{
				name: "Bot Latency",
				value: `${client.ws.ping}ms`,
				inline: true,
			},
			{
				name: "Bot Uptime",
				value: convertMillisToHumanReadable(interaction.client.uptime),
				inline: true,
			},
			{
				name: "Bot Version",
				value: "0.1.0",
				inline: true,
			},
			{
				name: "Bot Owner",
				value: "<@!1208479777900470344>",
				inline: true,
			},
			{
				name: "Bot Developers",
				value: "<@!1250923829761675336>",
				inline: true,
			},
			{
				name: "Server Count",
				value: `${
					client.application.approximateGuildCount ||
					client.guilds.cache.size
				}`,
				inline: true,
			},
			{
				name: "User Count",
				value: `${
					client.application.approximateUserInstallCount ||
					client.users.cache.size
				}`,
				inline: true,
			},
			{
				name: "Memory Usage",
				value: formatBytes(process.memoryUsage().heapUsed),
				inline: true,
			}
		);

	await interaction.reply({ embeds: [embed] });
}
