import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import { type ClientExtended, UserMadeError } from "../../utils/classes.ts";
import { Track } from "moonlink.js";

export const data = new SlashCommandBuilder()
	.setName("queue")
	.setDescription("Show the current and next up songs.");

export async function execute(interaction: ChatInputCommandInteraction) {
	const client: ClientExtended = interaction.client as ClientExtended;
	if (!interaction.guild) {
		throw new UserMadeError("You must use this in a server.");
	}
	const guildID = interaction.guild.id;
	const player = client.moonlink.players.get(guildID);
	if (!player) {
		throw new UserMadeError("No songs are currently playing.");
	}

	const queue = player.queue;

	const current = player.current;

	const calculatedPosition = current.position;

	let addon_title = "";

	if (current.isStream) {
		addon_title += " (Live)";
	}

	if (player.loop == "track") {
		addon_title += " (Looping)";
	}

	if (player.loop == "queue") {
		addon_title += " (Looping Queue)";
	}

	const embed = new EmbedBuilder()
		.setTitle(
			`Queue${addon_title} (${
				queue.size + (player.playing ? 1 : 0)
			} song(s))`
		)
		.setColor(0x9a2d7d)
		.setTimestamp()
		.setThumbnail(
			current.artworkUrl ||
				"https://www.solidbackgrounds.com/images/3840x2160/3840x2160-black-solid-color-background.jpg"
		)
		.setDescription(
			`**Now Playing:**\n[${current.title || "Unknown Track"}](${
				current.url || "https://www.google.com/"
			}) (requested by <@!${current.requestedBy}>) (duration: ${Math.floor(
				calculatedPosition / 1000
			)}/${Math.floor(current.duration / 1000)}s)`
		);

	if (queue.size > 0) {
		const next = queue.tracks.slice(0, 5);
		const nextString = next
			.map(
				(song: Track, index: number) =>
					`${index + 1}. [${song.title || "Unknown Track"}](${
						song.url || "https://www.google.com/"
					}) (requested by <@!${song.requestedBy}>)`
			)
			.join("\n");
		embed.addFields({
			name: "Next up:",
			value: nextString.concat(
				queue.size > 5 ? `\n... and ${queue.size - 5} more` : ""
			),
		});
	}

	await interaction.reply({ embeds: [embed] });
}
