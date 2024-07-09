import { EmbedBuilder, CommandInteraction, SlashCommandBuilder, User, Team, TeamMember} from "discord.js";

export const data = new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Show useful information about the bot.');

export async function execute(interaction: CommandInteraction) {
    const embed: EmbedBuilder = new EmbedBuilder()
        .setTitle('Debug Information')
        .setColor(0x00ff00)
        .setTimestamp()
        .addFields({
            name: 'Bot Latency',
            value: `${interaction.client.ws.ping}ms`
        }, {
            name: 'Bot Uptime',
            value: `${Math.floor(interaction.client.uptime / 1000 / 60)} minutes`,
        }, {
            name: 'Bot Version',
            value: '0.1.0'
        }, {
            name: 'Bot Owner',
            value: '<@!1208479777900470344>'
        }, {
            name: 'Bot Developers',
            value: '<@!1250923829761675336>'
        });

    await interaction.reply({ embeds: [embed]});
};