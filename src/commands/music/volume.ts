import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	GuildMember,
	MessageReaction,
	SlashCommandBuilder,
	SlashCommandIntegerOption,
	User,
} from "discord.js";
import { type ClientExtended, UserMadeError } from "../../utils/classes.ts";
import { getNestedKey, type ServerConfig } from "../../utils/config.ts";
import { getData } from "../../utils/mongohelper.ts";

export const data = new SlashCommandBuilder()
	.setName("volume")
	.setDescription("Sets the volume of the bot.")
	.addIntegerOption((option: SlashCommandIntegerOption) =>
		option
			.setName("volume")
			.setDescription("The volume you want to set.")
			.setRequired(true)
			.setMinValue(0)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	const client: ClientExtended = interaction.client as ClientExtended;
	if (!interaction.guild) {
		throw new UserMadeError("You must use this in a server.");
	}
	if (!interaction.channel) {
		throw new UserMadeError("You must use this in a server.");
	}
	const guildID = interaction.guild.id;
	const member: GuildMember = <GuildMember>interaction.member;
	if (!member.voice) {
		throw new UserMadeError("You are not in a voice channel.");
	}
	if (!member.voice.channel) {
		throw new UserMadeError("You are not in a voice channel.");
	}
	if (
		!member.voice.channel.joinable &&
		!member.voice.channel.permissionsFor(client.user!.id)?.has("Speak")
	) {
		throw new UserMadeError("I cannot join the voice channel.");
	}
	if (
		!member.voice.channel.members.get(client.user!.id) &&
		interaction.guild.members.cache.get(client.user!.id)!.voice.channel
	) {
		throw new UserMadeError("I am in another voice channel.");
	}

	const player = client.moonlink.players.get(guildID);
	if (!player) {
		throw new UserMadeError("No songs are currently playing.");
	}
	if (!player.playing) {
		throw new Error(
			"Goofy ahh library breaks every time. Now, we wait for the next update."
		);
	}

	const channel = member.voice.channel;

	const volume = interaction.options.getInteger("volume", true);

	if (!interaction.guild) {
		throw new UserMadeError("You must use this in a server.");
	}

	const serverId = interaction.guild.id; // Get the ID of the server executing the command

	const serverData = (await getData(client, "config", {
		serverid: serverId,
	})) as ServerConfig[];

	const configData = serverData[0]?.config || {};

	const maxVolume =
		(getNestedKey(configData, "music.maxvolume") as number) || 100;

	if (volume < 0 || volume > maxVolume) {
		throw new UserMadeError(
			`The volume must be between 0 and ${maxVolume}. This can be set using \`/serverconf set key:music.maxvolume value:ENTER_YOUR_NUMBER_HERE\``
		);
	}

	if (
		!(
			member.roles.cache.some((role) => role.name === "DJ") ||
			member.permissions.has("ModerateMembers", true) ||
			channel.members.filter(
				(member) => member.id !== client.user!.id && !member.user.bot
			).size <= 2
		)
	) {
		const votesNeeded = Math.ceil(
			channel.members.filter(
				(member) => member.id !== client.user!.id && !member.user.bot
			).size / 2
		);

		const embed = new EmbedBuilder()
			.setTitle("Vote to stop")
			.setDescription(
				`You are not a DJ, so you need to vote. React with ✅ to vote to change the volume of the player. Have ${votesNeeded} votes in 30 seconds. The vote will end <t:${
					Math.floor(Date.now() / 1000) + 30
				}:R>`
			)
			.setTimestamp()
			.setColor(0x9a2d7d);

		const interaction_reply = await interaction.reply({ embeds: [embed] });

		const message = await interaction_reply.fetch();

		await message.react("✅");

		const filter = (reaction: MessageReaction, user: User) =>
			reaction.emoji.name === "✅" &&
			user.id !== client.user!.id &&
			!user.bot;

		const collector = message.createReactionCollector({
			filter,
			time: 30000,
		});

		let votes = 0;

		collector.on("collect", () => {
			votes++;
		});

		collector.on("end", async () => {
			if (votes >= votesNeeded) {
				player!.setVolume(volume);
				await interaction.editReply({
					content: `Set the volume to ${volume}.`,
					embeds: [],
				});
			} else {
				await interaction.editReply({
					content: "Not enough votes to set the volume.",
					embeds: [],
				});
			}
		});

		return;
	}

	player.setVolume(volume);

	await interaction.reply({ content: `Set the volume to ${volume}.` });
}
