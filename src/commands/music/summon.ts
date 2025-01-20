import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	GuildMember,
	MessageReaction,
	SlashCommandBuilder,
	SlashCommandChannelOption,
	User,
} from "discord.js";
import { type ClientExtended, UserMadeError } from "../../utils/classes.ts";

export const data = new SlashCommandBuilder()
	.setName("summon")
	.setDescription("Tell the bot to come to your voice channel.")
	.addChannelOption((option: SlashCommandChannelOption) =>
		option
			.setName("channel")
			.setDescription("The channel to join.")
			.setRequired(true)
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
				`You are not a DJ, so you need to vote. React with ✅ to vote to connect to your voice call. Have ${votesNeeded} votes in 30 seconds. The vote will end <t:${
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
				await player.setVoiceChannelId(
					interaction.options.getChannel("channel", true).id
				);

				await player.connect({
					setDeaf: true,
					setMute: false,
				});

				await interaction.editReply({
					content: "Connected to your voice call.",
					embeds: [],
				});
			} else {
				await interaction.editReply({
					content: "Not enough votes to connect to your voice call.",
					embeds: [],
				});
			}
		});

		return;
	}

	await player.setVoiceChannelId(
		interaction.options.getChannel("channel", true).id
	);

	await player.connect({
		setDeaf: true,
		setMute: false,
	});

	await interaction.reply({
		content: "Connected to your voice call.",
	});
}
