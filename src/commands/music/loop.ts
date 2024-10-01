import {
	EmbedBuilder,
	SlashCommandBuilder,
	User,
	SlashCommandStringOption,
	GuildMember,
	MessageReaction,
	ChatInputCommandInteraction,
} from "discord.js";
import { type ClientExtended, UserMadeError } from "../../utils/classes.ts";
import type { TPlayerLoop } from "moonlink.js";

export const data = new SlashCommandBuilder()
	.setName("loop")
	.setDescription("Sets the queue to loop.")
	.addStringOption((option: SlashCommandStringOption) =>
		option
			.setName("type")
			.setDescription("Type of looping you want for the queue.")
			.setRequired(true)
			.addChoices(
				{
					name: "No looping.",
					value: "none",
				},
				{
					name: "Loop the current song.",
					value: "track",
				},
				{
					name: "Loop the whole queue.",
					value: "queue",
				},
			),
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

	const loop_type = interaction.options.get("type", true).value! as string;

	if (
		!(
			member.roles.cache.some((role) => role.name === "DJ") ||
			member.permissions.has("ModerateMembers", true) ||
			member.voice.channel.members.filter((member) => !member.user.bot)
				.size <= 2
		)
	) {
		const embed = new EmbedBuilder()
			.setTitle("Vote to loop")
			.setDescription(
				`You are not a DJ, so you need to vote to loop the player. React with ✅ to vote start/end the looping. You have 30 seconds to vote. Have ${Math.ceil(
					member.voice.channel.members.filter(
						(member) => !member.user.bot,
					).size / 2,
				)} votes to start/end looping.`,
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
				Math.floor(
					member.voice.channel!.members.filter(
						(member) => !member.user.bot,
					).size / 2,
				) +
					1
			) {
				player!.setLoop(loop_type as TPlayerLoop);
				if (loop_type == "none") {
					await interaction.editReply({
						content: "Disabled looping.",
						embeds: [],
					});
					return;
				} else if (loop_type == "track") {
					await interaction.editReply({
						content: "Looping the current song.",
						embeds: [],
					});
					return;
				} else if (loop_type == "queue") {
					await interaction.editReply({
						content: "Looping the whole queue.",
						embeds: [],
					});
					return;
				}
			} else {
				await interaction.editReply({
					content: "Not enough votes to start/end looping.",
					embeds: [],
				});
			}
		});

		return;
	}

	player!.setLoop(loop_type as TPlayerLoop);

	if (loop_type == "none") {
		await interaction.reply({ content: "Disabled looping.", embeds: [] });
		return;
	} else if (loop_type == "track") {
		await interaction.reply({
			content: "Looping the current song.",
			embeds: [],
		});
		return;
	} else if (loop_type == "queue") {
		await interaction.reply({
			content: "Looping the whole queue.",
			embeds: [],
		});
		return;
	}
}
