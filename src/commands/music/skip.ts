import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	GuildMember,
	MessageReaction,
	SlashCommandBuilder,
	SlashCommandNumberOption,
	User,
} from "discord.js";
import { type ClientExtended, UserMadeError } from "../../utils/classes.ts";
import type { Queue } from "moonlink.js";

const removeFromQueue = (queue: Queue, amount: number) => {
	// Check if amount is 2 or greater
	if (amount >= 2) {
		// Calculate how many times to remove from the front
		const numberOfRemovals = amount - 1; // Calculate the number of removals

		// Only remove items if we have valid positions in the queue
		for (let i = 0; i < numberOfRemovals; i++) {
			if (queue.size > 0) {
				// Ensure there's something to remove
				queue.remove(0); // Remove the item at index 0
			}
		}
	}
};

export const data = new SlashCommandBuilder()
	.setName("skip")
	.setDescription("Skips the current song in the queue.")
	.addNumberOption((option: SlashCommandNumberOption) =>
		option
			.setName("amount")
			.setDescription("The amount of songs to skip.")
			.setRequired(false)
			.setMaxValue(600)
			.setMinValue(1)
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

	const amount_object = interaction.options.get("amount", false);
	const amount = amount_object ? (amount_object.value as number) : 1;
	if (amount > player.queue.size + (player.current ? 1 : 0)) {
		throw new UserMadeError(
			`You cannot skip more songs than the queue has (${player.queue.size} song(s)).`
		);
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
				`You are not a DJ, so you need to vote. React with ✅ to vote to skip the song(s). Have ${votesNeeded} votes in 30 seconds. The vote will end <t:${
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
				removeFromQueue(player.queue, amount);
				if (player.queue.size == 0) {
					player.destroy();
					await interaction.editReply({
						content:
							"Skipped the current song and left the voice call.",
						embeds: [],
					});
					return;
				}
				player.skip(0);
				await interaction.editReply({
					content: "Skipped the current song.",
					embeds: [],
				});
			} else {
				await interaction.editReply({
					content: "Not enough votes to skip the song.",
					embeds: [],
				});
			}
		});

		return;
	}

	removeFromQueue(player.queue, amount);
	if (player.queue.size == 0) {
		player.destroy();
		await interaction.reply({
			content: "Skipped the current song and left the voice call.",
			embeds: [],
		});
		return;
	}
	player.skip(0);

	await interaction.reply({ content: "Skipped the current song." });
}
