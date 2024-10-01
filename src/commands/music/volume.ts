import {
	EmbedBuilder,
	SlashCommandBuilder,
	User,
	SlashCommandIntegerOption,
	GuildMember,
	MessageReaction,
	ChatInputCommandInteraction,
} from "discord.js";
import { type ClientExtended, UserMadeError } from "../../utils/classes.ts";

export const data = new SlashCommandBuilder()
	.setName("volume")
	.setDescription("Sets the volume of the bot.")
	.addIntegerOption((option: SlashCommandIntegerOption) =>
		option
			.setName("volume")
			.setDescription("The volume you want to set.")
			.setRequired(true)
			.setMinValue(0)
			.setMaxValue(400),
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
			"Goofy ahh library breaks every time. Now, we wait for the next update.",
		);
	}

	const volume = <number>interaction.options.get("volume", true).value;

	if (
		!(
			member.roles.cache.some((role) => role.name === "DJ") ||
			member.permissions.has("ModerateMembers", true) ||
			member.voice.channel.members.filter((member) => !member.user.bot)
				.size <= 2
		)
	) {
		const embed = new EmbedBuilder()
			.setTitle("Vote to set volume")
			.setDescription(
				`You are not a DJ, so you need to vote to set the volume. React with ✅ to set it. You have 30 seconds to vote. Have ${Math.ceil(
					member.voice.channel.members.filter(
						(member) => !member.user.bot,
					).size / 2,
				)} votes to set the loudness.`,
			)
			.setTimestamp()
			.setColor("#2b2d31");

		const interaction_reply = await interaction.reply({ embeds: [embed] });

		const message = await interaction_reply.fetch();

		await message.react("✅");

		const filter = (reaction: MessageReaction, user: User) =>
			reaction.emoji.name === "✅" && user.id !== client.user!.id;

		const collector = message.createReactionCollector({
			filter,
			time: 30000,
		});

		let votes = 0;

		collector.on("collect", () => {
			votes++;
		});

		collector.on("end", async () => {
			if (
				votes >=
				Math.ceil(
					member.voice.channel!.members.filter(
						(member) => !member.user.bot,
					).size / 2,
				)
			) {
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
