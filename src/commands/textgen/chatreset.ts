import { EmbedBuilder, CommandInteraction, SlashCommandBuilder, User, Team, TeamMember, SlashCommandStringOption} from "discord.js";
import type { ClientExtended } from "../../classes.js";

export const data = new SlashCommandBuilder()
        .setName('chatreset')
        .setDescription('Reset the chat with Agent Kitten.');

export async function execute(interaction: CommandInteraction) {
    const client = interaction.client as ClientExtended;

    await client.mongoclient.db("agentkitten").collection("textgen").deleteOne({ user_id: interaction.user.id });

    await interaction.reply({ content: "The chat has been reset." });
}