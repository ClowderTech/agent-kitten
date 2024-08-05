import { EmbedBuilder, CommandInteraction, SlashCommandBuilder, User, Team, TeamMember, Collection, Client, GuildMember, SlashCommandNumberOption} from "discord.js";
import { type ClientExtended, UserMadeError } from "../../classes";

export const data = new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skips the current song in the queue.')
        .addNumberOption((option: SlashCommandNumberOption) => option.setName("amount").setDescription("The amount of songs to skip.").setRequired(false).setMaxValue(600).setMinValue(1));

export async function execute(interaction: CommandInteraction) {
    let client: ClientExtended = interaction.client as ClientExtended;
    if (!interaction.guild) {
        throw new UserMadeError("You must use this in a server.");
    }
    if (!interaction.channel) {
        throw new UserMadeError("You must use this in a server.");
    }
    let guildID = interaction.guild.id
    let member: GuildMember = <GuildMember>interaction.member;
    if (!member.voice) {
        throw new UserMadeError("You are not in a voice channel.");
    }
    if (!member.voice.channel) {
        throw new UserMadeError("You are not in a voice channel.");
    }
    if (!member.voice.channel.joinable && !member.voice.channel.permissionsFor(client.user!.id)?.has("Speak")) {
        throw new UserMadeError("I cannot join the voice channel.");
    }
    if (!member.voice.channel.members.get(client.user!.id) && interaction.guild.members.cache.get(client.user!.id)!.voice.channel) {
        throw new UserMadeError("I am in another voice channel.");
    }
    

    let player = client.kazagumo.players.get(guildID);
    if (!player) {
        throw new UserMadeError("No songs are currently playing.");
    }

    let amount_object = interaction.options.get("amount", false);
    let amount = amount_object ? <number>amount_object.value : 1;
    if (amount > player.queue.totalSize) {
        throw new UserMadeError(`You cannot skip more songs than the queue has (${player.queue.size} song(s)).`);
    }


    if (!(member.roles.cache.some(role => role.name === "DJ") || member.permissions.has("ModerateMembers", true) || member.voice.channel.members.filter(member => !member.user.bot).size <= 2)) {
        let embed = new EmbedBuilder()
            .setTitle("Vote to skip")
            .setDescription(`You are not a DJ, so you need to vote to skip the song. React with ✅ to vote to skip. The vote will end <t:${Math.floor(Date.now() / 1000) + 30}:R>. Have ${Math.ceil(member.voice.channel.members.filter(member => !member.user.bot).size / 2)} votes to skip.`)
            .setTimestamp()
            .setColor("#2b2d31")
            
        let interaction_reply = await interaction.reply({embeds: [embed]});

        let message = await interaction_reply.fetch();

        await message.react("✅");

        let filter = (reaction: any, user: User) => reaction.emoji.name === "✅" && user.id !== client.user!.id;

        let collector = message.createReactionCollector({filter, time: 30000});

        let votes = 0;

        collector.on("collect", (reaction, user) => {
            votes++;
        });

        collector.on("end", async (collected, reason) => {
            if (votes >= Math.ceil(member.voice.channel!.members.filter(member => !member.user.bot).size / 2)) {
                for (let i = 0; i < amount; i++) {
                    player.skip();
                }
                await interaction.editReply({content: "Skipped the current song.", embeds: []});
            } else {
                await interaction.editReply({content: "Not enough votes to skip the song.", embeds: []});
            }
        });

        return;
    }

    for (let i = 0; i < amount; i++) {
        player.skip();
    }

    await interaction.reply({content: "Skipped the current song."});
};