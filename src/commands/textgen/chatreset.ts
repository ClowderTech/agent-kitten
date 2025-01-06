import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	InteractionContextType,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import type { ClientExtended } from "../../utils/classes.ts";
import { deleteData } from "../../utils/mongohelper.ts";

export const data = new SlashCommandBuilder()
	.setName("chatreset")
	.setDescription("Reset the chat with Agent Kitten.")
	.setIntegrationTypes([
		ApplicationIntegrationType.UserInstall,
		ApplicationIntegrationType.GuildInstall,
	])
	.setContexts([
		InteractionContextType.BotDM,
		InteractionContextType.Guild,
		InteractionContextType.PrivateChannel,
	]);

export async function execute(interaction: ChatInputCommandInteraction) {
	const client = interaction.client as ClientExtended;

	const deleted = await deleteData(client, "textgen", {
		userid: interaction.user.id,
	});

	if (!deleted) {
		await interaction.reply({
			content: "You already had no chat data.",
			flags: [MessageFlags.Ephemeral],
		});
	} else {
		await interaction.reply({
			content: "Your chat data has been reset.",
			flags: [MessageFlags.Ephemeral],
		});
	}
}
