import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	GuildMember,
	SlashCommandBuilder,
	SlashCommandStringOption,
} from "discord.js";
import { type ClientExtended, UserMadeError } from "../../utils/classes.ts";

export const data = new SlashCommandBuilder()
	.setName("play")
	.setDescription("Play the given song in your current voice call.")
	.addStringOption((option: SlashCommandStringOption) =>
		option
			.setName("song")
			.setDescription("The song name or URL to play.")
			.setRequired(true)
	);

export async function execute(
	interaction: ChatInputCommandInteraction
): Promise<void> {
	const client = interaction.client as ClientExtended;
	if (!interaction.guild || !interaction.channel) {
		throw new UserMadeError("You must use this in a server.");
	}
	const guildId = interaction.guild.id;
	const member = interaction.member as GuildMember;

	if (!member.voice || !member.voice.channel) {
		throw new UserMadeError("You are not in a voice channel.");
	}

	const voiceChannel = member.voice.channel;
	if (
		!voiceChannel.joinable ||
		!voiceChannel.permissionsFor(client.user!.id)?.has("Speak")
	) {
		throw new UserMadeError("I cannot join the voice channel.");
	}

	if (
		client.moonlink.players.get(guildId) &&
		!voiceChannel.members.has(client.user!.id)
	) {
		throw new UserMadeError("I am in another voice channel.");
	}

	const player =
		client.moonlink.players.get(guildId) ||
		client.moonlink.players.create({
			guildId,
			voiceChannelId: voiceChannel.id,
			textChannelId: interaction.channel.id,
			volume: 100,
			autoPlay: false,
			autoLeave: true,
		});

	if (!player) {
		client.moonlink.nodes.cache.forEach((node) =>
			client.moonlink.nodes.check(node)
		);
		throw new UserMadeError(
			"There was an issue completing this command. Please send the command again and it should work."
		);
	}

	if (!player.connected) {
		player.connect({ setDeaf: true, setMute: false });
	}

	const song = interaction.options.getString("song", true);

	await interaction.deferReply();

	const playable = await client.moonlink.search({
		query: song,
		requester: interaction.user.id,
		source: "youtubemusic",
	});

	if (playable.loadType === "empty") {
		throw new UserMadeError("No songs were found.");
	} else if (playable.loadType === "error") {
		throw new Error("An error occurred while searching for the song.");
	}

	let description = "";
	const thumbnail =
		playable.tracks[0].artworkUrl ||
		"https://www.solidbackgrounds.com/images/3840x2160/3840x2160-black-solid-color-background.jpg";

	if (playable.loadType === "track") {
		player.queue.add(playable.tracks[0]);
		description = `Queued song: ${playable.tracks[0].title || "Unknown Track"}`;
	} else if (playable.loadType === "playlist") {
		for (const track of playable.tracks) {
			player.queue.add(track);
		}
		description = `Queued playlist: ${playable.playlistInfo.name}`;
	} else if (playable.loadType === "search") {
		player.queue.add(playable.tracks[0]);
		description = `Queued song: ${playable.tracks[0].title || "Unknown Track"}`;
	}

	const embed = new EmbedBuilder()
		.setTitle(
			playable.loadType === "playlist" ? "Queued playlist" : "Queued song"
		)
		.setDescription(description)
		.setColor("#9A2D7D")
		.setThumbnail(thumbnail)
		.setTimestamp();

	await interaction.followUp({ embeds: [embed] });

	if (!player.playing) {
		player.play();
	}
}
