import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import type { ClientExtended } from "../../utils/classes.ts"; // Import your client extended type
import { getUsersByExperienceRange } from "../../utils/leveling.ts"; // Adjust the import path

// Define the command using SlashCommandBuilder
export const data = new SlashCommandBuilder()
	.setName("leaderboard")
	.setDescription("Show the top 10 users on the leaderboard.");

// Execute the command
export async function execute(interaction: ChatInputCommandInteraction) {
	const client: ClientExtended = interaction.client as ClientExtended; // Ensure the correct type for the client

	const guildId = interaction.guildId;

	if (!guildId) {
		interaction.reply("You didn't execute this in a server!");
		return;
	}

	// Get top 10 users based on experience
	const topUsers = await getUsersByExperienceRange(client, guildId, 0, 9); // Get users from index 0 to 9

	// Create a description for the top users with mentions and their level and experience
	let description = "🏆 **Top 10 Users** 🏆\n\n";

	topUsers.forEach((user) => {
		description += `<@!${user.userid}> - Level: ${user.level}, Experience: ${user.experience}\n`; // Create mention with level and experience
	});

	// Create an embed to display the results
	const embed: EmbedBuilder = new EmbedBuilder()
		.setTitle("Leaderboard")
		.setColor(0x9a2d7d)
		.setDescription(description) // Set the description with user mentions
		.setTimestamp();

	// Reply to the interaction with the embed
	await interaction.reply({ embeds: [embed] });
}
