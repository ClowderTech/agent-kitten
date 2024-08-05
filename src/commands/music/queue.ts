import { EmbedBuilder, CommandInteraction, SlashCommandBuilder, User, Team, TeamMember, Collection, Client} from "discord.js";
import { type ClientExtended, UserMadeError } from "../../classes";

export const data = new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current and next up songs.');

export async function execute(interaction: CommandInteraction) {
    let client: ClientExtended = interaction.client as ClientExtended;
    if (!interaction.guild) {
        throw new UserMadeError("You must use this in a server.");
    }
    let guildID = interaction.guild.id
    let player = client.kazagumo.players.get(guildID);
    if (!player) {
        throw new UserMadeError("No songs are currently playing.");
    }

    let queue = player.queue;

    const calculatedPosition = player.position;

    let addon_title = "";

    if (player.queue.current?.isStream) {
        addon_title += " (Live)";
    }

    if (player.loop == "track") {
        addon_title += " (Looping)";
    }

    if (player.loop == "queue") {
        addon_title += " (Looping Queue)";
    }

    let embed = new EmbedBuilder()
        .setTitle(`Queue${addon_title} (${(player.queue.totalSize)} song(s))`)
        .setColor("#2b2d31")
        .setTimestamp()
        .setThumbnail(player.queue.current?.thumbnail ?? "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/A_black_image.jpg/640px-A_black_image.jpg")
        .setDescription(`**Now Playing:**\n[${player.queue.current?.title}](${player.queue.current?.realUri}) (requested by ${player.queue.current?.requester}) (duration: ${Math.floor(calculatedPosition / 1000)}/${Math.floor(player.queue.current?.length! / 1000)}s)`);

    if (queue.totalSize - 1 > 0) {
        let next = player.queue.slice(0, 4);
        let nextString = next.map((song, index)  => `${index + 1}. [${song.title}](${song.realUri}) (requested by ${song.requester})`).join("\n");
        embed.addFields({name: "Next up:", value: nextString.concat(queue.totalSize - 1 > 5 ? `\n... and ${queue.totalSize - 6} more` : "")});
    }

    await interaction.reply({embeds: [embed]});
};