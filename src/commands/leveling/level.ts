import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import { type ClientExtended } from "../../utils/classes.ts";
import {
	calculateExpToNextLevel,
	getMemberExperience,
	getMemberLevel,
} from "../../utils/leveling.ts"; // Import necessary functions

// Define the new command with an optional user option
export const data = new SlashCommandBuilder()
	.setName("level")
	.setDescription("Show your current level and experience.")
	.addUserOption((option) =>
		option
			.setName("user")
			.setDescription("Select a user to check their level.")
			.setRequired(false)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	// Get the user option; if not provided, default to the command executor
	const user =
		interaction.options.get("user", false)?.user || interaction.user;
	const guildId = interaction.guildId;

	if (!guildId) {
		interaction.reply("You didn't execute this in a server!");
		return;
	}

	// Fetch the member's experience using the helper function
	const userId = user.id; // Get the ID of the target user
	const memberExperience = await getMemberExperience(
		interaction.client as ClientExtended,
		userId,
		guildId
	);
	const memberLevel = await getMemberLevel(
		interaction.client as ClientExtended,
		userId,
		guildId
	);

	// Calculate how much experience is needed for the next level
	const expNeededForNextLevel = calculateExpToNextLevel(
		memberLevel,
		memberExperience
	);

	// Build the embed
	const embed: EmbedBuilder = new EmbedBuilder()
		.setColor(0x9a2d7d)
		.setTitle("Level Information")
		.setDescription(`Here is <@${userId}>'s level info!`) // Ping the user
		.addFields(
			{ name: "Current Level", value: `${memberLevel}`, inline: true },
			{
				name: "Current Experience",
				value: `${memberExperience}`,
				inline: true,
			},
			{
				name: "EXP Needed for Next Level",
				value: `${expNeededForNextLevel}`,
				inline: true,
			}
		)
		.setTimestamp();

	// Send the reply with the embed
	await interaction.reply({ embeds: [embed] });
}
