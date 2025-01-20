import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	GuildMember,
	MessageReaction,
	SlashCommandBuilder,
	User,
} from "discord.js";
import { type ClientExtended, UserMadeError } from "../../utils/classes.ts";

export const data = new SlashCommandBuilder()
	.setName("pause")
	.setDescription("Pauses or resumes the current song.");

export async function execute(interaction: ChatInputCommandInteraction) {
	const client: ClientExtended = interaction.client as ClientExtended;

	if (!interaction.guild) {
		throw new UserMadeError("You must use this in a server.");
	}
	if (!interaction.channel) {
		throw new UserMadeError("You must use this in a server.");
	}

	const guildID = interaction.guild.id;
	const member: GuildMember = interaction.member as GuildMember;

	if (!member.voice || !member.voice.channel) {
		throw new UserMadeError("You are not in a voice channel.");
	}
	if (
		!member.voice.channel.joinable ||
		!member.voice.channel.permissionsFor(client.user!)!.has("Speak")
	) {
		throw new UserMadeError("I cannot join the voice channel.");
	}
	if (
		interaction.guild.members.cache.get(client.user!.id)?.voice.channel &&
		interaction.guild.members.cache.get(client.user!.id)!.voice.channel!
			.id !== member.voice.channel.id
	) {
		throw new UserMadeError("I am in another voice channel.");
	}

	const player = client.moonlink.players.get(guildID);
	if (!player) {
		throw new UserMadeError("No songs are currently playing.");
	}

	const channel = member.voice.channel;

	if (
		!(
			member.roles.cache.some((role) => role.name === "DJ") ||
			member.permissions.has("ModerateMembers", true) ||
			channel.members.filter(
				(member) => !member.user.bot && member.id !== client.user!.id
			).size <= 2
		)
	) {
		const votesNeeded = Math.ceil(
			channel.members.filter(
				(member) => !member.user.bot && member.id !== client.user!.id
			).size / 2
		);

		const embed = new EmbedBuilder()
			.setTitle("Vote to pause/resume")
			.setDescription(
				`You are not a DJ, so you need to vote. React with ✅ to vote to pause/resume the player. Have ${votesNeeded} votes in 30 seconds. The vote will end <t:${
					Math.floor(Date.now() / 1000) + 30
				}:R>`
			)
			.setTimestamp()
			.setColor(0x9a2d7d);

		const interactionReply = await interaction.reply({ embeds: [embed] });
		const message = await interactionReply.fetch();

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
		collector.on("collect", () => votes++);

		collector.on("end", async () => {
			if (votes >= votesNeeded) {
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				player.paused ? player.resume() : player.pause();
				await interaction.editReply({
					content: `${player.paused ? "Resumed" : "Paused"} the current song.`,
				});
			} else {
				await interaction.editReply({
					content: "Not enough votes to pause/resume the player.",
					embeds: [],
				});
			}
		});

		return;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-expressions
	player.paused ? player.resume() : player.pause();
	await interaction.reply({
		content: `${player.paused ? "Resumed" : "Paused"} the current song.`,
	});
}
