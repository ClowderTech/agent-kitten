import {
	EmbedBuilder,
	SlashCommandBuilder,
	User,
	ChatInputCommandInteraction,
} from "discord.js";
import { type ClientExtended } from "../../utils/classes.ts";
import {
	getMemberExperience,
	calculateLevelFromExperience,
	calculateExperienceFromLevel,
} from "../../utils/leveling.ts"; // Import necessary functions

// Define the new command with an optional user option
export const data = new SlashCommandBuilder()
	.setName("level")
	.setDescription("Show your current level and experience.")
	.addUserOption((option) =>
		option
			.setName("user")
			.setDescription("Select a user to check their level.")
			.setRequired(false),
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	// Get the user option; if not provided, default to the command executor
	const user: User =
		interaction.options.get("user", false)?.user || interaction.user;

	// Fetch the member's experience using the helper function
	const userId = user.id; // Get the ID of the target user
	const memberExperience = await getMemberExperience(
		interaction.client as ClientExtended,
		userId,
	);

	// Calculate the user's current level using their experience
	const currentLevel = calculateLevelFromExperience(memberExperience);

	// Calculate how much experience is needed for the next level
	const expNeededForNextLevel = calculateExperienceFromLevel(
		currentLevel + 1,
	);

	// Build the embed
	const embed: EmbedBuilder = new EmbedBuilder()
		.setColor("#2b2d31")
		.setTitle("Level Information")
		.setDescription(`<@${userId}>, here is your level info!`) // Ping the user
		.addFields(
			{ name: "Current Level", value: `${currentLevel}`, inline: true },
			{
				name: "Current Experience",
				value: `${memberExperience}`,
				inline: true,
			},
			{
				name: "EXP Needed for Next Level",
				value: `${expNeededForNextLevel}`,
				inline: true,
			},
		)
		.setTimestamp();

	// Send the reply with the embed
	await interaction.reply({ embeds: [embed] });
}
