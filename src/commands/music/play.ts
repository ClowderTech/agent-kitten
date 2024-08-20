import { SlashCommandStringOption, SlashCommandBuilder, CommandInteraction, GuildMember, EmbedBuilder } from "discord.js"
import { type ClientExtended, UserMadeError } from "../../classes";

export const data =  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play the given song in your current voice call.')
    .addStringOption((option: SlashCommandStringOption) => option.setName("song").setDescription("The song name or url to play.").setRequired(true));

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
        let channel = member.voice.channel;
        player = client.moonlink.players.create({
            guildId: guildID,
            voiceChannelId: member.voice.channel.id,
            textChannelId: interaction.channel.id,
            volume: Math.floor(100 / 2),
            autoPlay: false,
            autoLeave: true,
        });
    }

    // player.setAutoLeave(true);
    // player.setAutoPlay(false);

    if (!player.connected) {
        player.connect({
            setDeaf: true,
            setMute: false,
        });
    }

    let song = <string>interaction.options.get("song", true).value;

    await interaction.deferReply();

    let playable = await client.moonlink.search({
        query: song,
        requester: interaction.user.id,
        source: "youtubemusic"
    });

    if (playable.loadType === "empty") {
        throw new UserMadeError("No songs were found.");
    } else if (playable.loadType === "error") {
        throw new Error("An error occurred while searching for the song.")
    }

    if (playable.loadType === "track") {
        player.queue.add(playable.tracks[0]);
        let embed = new EmbedBuilder()
            .setTitle("Queued song")
            .setDescription(`Queued song: \`${playable.tracks[0].title}\``)
            .setColor("#2b2d31")
            .setThumbnail(playable.tracks[0].artworkUrl!)
            .setTimestamp()
        await interaction.followUp({embeds: [embed]})
    } else if (playable.loadType === "playlist") {
        for (let track of playable.tracks) {
            if (!player) {
                return;
            }
            player.queue.add(track);
        };
        let embed = new EmbedBuilder()
            .setTitle("Queued playlist")
            .setDescription(`Queued playlist: \`${playable.playlistInfo.name}\``)
            .setColor("#2b2d31")
            .setThumbnail(playable.tracks[0].artworkUrl!)
            .setTimestamp()
        await interaction.followUp({embeds: [embed]})
    } else if (playable.loadType === "search") {
        player.queue.add(playable.tracks[0]);
        let embed = new EmbedBuilder()
            .setTitle("Queued song")
            .setDescription(`Queued song: \`${playable.tracks[0].title}\``)
            .setColor("#2b2d31")
            .setThumbnail(playable.tracks[0].artworkUrl!)
            .setTimestamp()
        await interaction.followUp({embeds: [embed]});
    }

    if (!player.playing && !player.paused) {
        player.play();
    }
};