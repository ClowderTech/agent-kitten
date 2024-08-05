import { EmbedBuilder, CommandInteraction, SlashCommandBuilder, User, Team, TeamMember, Collection, Client} from "discord.js";
import { MoonlinkManager, MoonlinkTrack } from "moonlink.js";
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
    let player = client.moonlink.players.get(guildID);
    if (!player) {
        throw new UserMadeError("No songs are currently playing.");
    }

    let queue = player.queue;

    const elapsed = Date.now() - player.current.time;
    const calculatedPosition = player.current.position + elapsed;

    let addon_title = "";

    if (player.current.isStream) {
        addon_title += " (Live)";
    }

    if (player.loop == 1) {
        addon_title += " (Looping)";
    }

    if (player.loop == 2) {
        addon_title += " (Looping Queue)";
    }

    let embed = new EmbedBuilder()
        .setTitle(`Queue${addon_title} (${(player.queue.size + (player.playing ? 1 : 0))} song(s))`)
        .setColor("#2b2d31")
        .setTimestamp()
        .setThumbnail(player.current.artworkUrl)
        .setDescription(`**Now Playing:**\n[${player.current.title}](${player.current.url}) (requested by <@!${player.current.requester}>) (duration: ${Math.floor(calculatedPosition / 1000)}/${Math.floor(player.current.duration / 1000)}s)`);

    if (queue.size > 0) {
        let next = queue.all.slice(0, 5);
        let nextString = next.map((song: MoonlinkTrack, index: number) => `${index + 1}. [${song.title}](${song.url}) (requested by <@!${song.requester}>)`).join("\n");
        embed.addFields({name: "Next up:", value: nextString.concat(queue.size > 5 ? `\n... and ${queue.size - 5} more` : "")});
    }

    await interaction.reply({embeds: [embed]});
};