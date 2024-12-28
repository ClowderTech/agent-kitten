import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	InteractionContextType,
	SlashCommandBuilder,
} from "discord.js";
import type { ClientExtended } from "../../../utils/classes.ts";
import { deleteData, getData } from "../../../utils/mongohelper.ts";

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

	const chatData = await getData(client, "textgen", {
		userId: interaction.user.id,
	});

	if (!chatData[0]) {
		await interaction.reply({
			content: "You already had no chat data.",
			ephemeral: true,
		});
		return;
	}

	await deleteData(client, "textgen", chatData[0]["_id"]);

	await interaction.reply({
		content: "Your chat data has been reset.",
		ephemeral: true,
	});
}
