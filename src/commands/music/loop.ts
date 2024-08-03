import { EmbedBuilder, CommandInteraction, SlashCommandBuilder, User, Team, TeamMember, Collection, Client, SlashCommandIntegerOption, GuildMember} from "discord.js";
import { MoonlinkManager, MoonlinkTrack } from "moonlink.js";
import { type ClientExtended, UserMadeError } from "../../classes";

export const data = new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Sets the queue to loop.')
        .addIntegerOption((option: SlashCommandIntegerOption) => option.setName("type").setDescription("Type of looping you want for the queue.").setRequired(true).addChoices({
            name: "No looping.",
            value: 0
        }, {
            name: "Loop the current song.",
            value: 1
        }, {
            name: "Loop the whole queue.",
            value: 2
        }));

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
    

    let player = client.moonlink.players.get(guildID);
    if (!player) {
        throw new UserMadeError("No songs are currently playing.");
    }

    let loop_type = <number>interaction.options.get("type", true).value;

    if (!(member.roles.cache.some(role => role.name === "DJ") || member.permissions.has("ModerateMembers", true) || member.voice.channel.members.filter(member => !member.user.bot).size <= 2)) {
        let embed = new EmbedBuilder()
            .setTitle("Vote to loop")
            .setDescription(`You are not a DJ, so you need to vote to loop the player. React with ✅ to vote start/end the looping. You have 30 seconds to vote. Have ${Math.ceil(member.voice.channel.members.filter(member => !member.user.bot).size / 2)} votes to start/end looping.`)
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
            if (votes >= Math.floor(member.voice.channel!.members.filter(member => !member.user.bot).size / 2) + 1) {
                player!.setLoop(loop_type);
                if (loop_type == 0) {
                    await interaction.editReply({content: "Disabled looping.", embeds: []});
                    return;
                } else if (loop_type == 1) {
                    await interaction.editReply({content: "Looping the current song.", embeds: []});
                    return;
                } else if (loop_type == 2) {
                    await interaction.editReply({content: "Looping the whole queue.", embeds: []});
                    return;
                }
            } else {
                await interaction.editReply({content: "Not enough votes to start/end looping.", embeds: []});
            }
        });
        
        return;
    }

    player.setLoop(loop_type);

    if (loop_type == 0) {
        await interaction.reply({content: "Disabled looping."});
        return;
    } else if (loop_type == 1) {
        await interaction.reply({content: "Looping the current song."});
        return;
    } else if (loop_type == 2) {
        await interaction.reply({content: "Looping the whole queue."});
        return;
    }
};