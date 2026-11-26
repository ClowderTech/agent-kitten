use crate::utils::music::join_voice_call;
use crate::{Context, Error};
use lavalink_rs::model::search::SearchEngines;
use lavalink_rs::model::track::TrackLoadData;
use lavalink_rs::player_context::TrackInQueue;
use poise::CreateReply;
use serenity::builder::{CreateEmbed, CreateEmbedAuthor, CreateEmbedFooter};

/// Play a song in the voice channel you are connected in.
#[poise::command(slash_command, guild_only)]
pub async fn play(
    ctx: Context<'_>,
    #[description = "Search term or URL"]
    #[rest]
    term: String,
) -> Result<(), Error> {
    ctx.defer().await?;

    let guild_id = ctx.guild_id().unwrap();

    join_voice_call(&ctx, guild_id, None)
        .await
        .expect("Bot could not join voice call");

    let lava_client = ctx.data().lavalink.clone();

    let player = match lava_client.get_player_context(guild_id.get()) {
        Some(player) => player,
        None => {
            let manager = songbird::get(ctx.serenity_context()).await.unwrap().clone();
            let lava_client = ctx.data().lavalink.clone();

            lava_client.delete_player(guild_id.get()).await?;

            if manager.get(guild_id).is_some() {
                manager.remove(guild_id).await?;
            }

            join_voice_call(&ctx, guild_id, None)
                .await
                .expect("Bot could not join voice call");

            lava_client
                .get_player_context(guild_id.get())
                .expect("Lavalink refusing to connect")
        }
    };

    let query = if term.starts_with("http") {
        term
    } else {
        SearchEngines::YouTubeMusic.to_query(&term).unwrap()
    };

    let loaded_tracks = lava_client.load_tracks(guild_id.get(), &query).await?;

    let mut playlist_info = None;

    let mut tracks: Vec<TrackInQueue> = match loaded_tracks.data {
        Some(TrackLoadData::Track(x)) => vec![x.into()],
        Some(TrackLoadData::Search(x)) => vec![x[0].clone().into()],
        Some(TrackLoadData::Playlist(x)) => {
            playlist_info = Some(x.info);
            x.tracks.iter().map(|x| x.clone().into()).collect()
        }

        _ => {
            ctx.say(format!("{:?}", loaded_tracks)).await?;
            return Ok(());
        }
    };

    let mut embed = CreateEmbed::default()
        .author(
            CreateEmbedAuthor::new(ctx.http().get_current_user().await?.display_name()).icon_url(
                ctx.http()
                    .get_current_user()
                    .await?
                    .avatar_url()
                    .unwrap_or_default(),
            ),
        )
        .timestamp(chrono::Utc::now())
        .footer(
            CreateEmbedFooter::new(ctx.author().display_name())
                .icon_url(ctx.author().avatar_url().unwrap_or_default()),
        )
        .title("Added to queue!")
        .color(0x9A2D7D);

    if let Some(track_artwork) = &tracks[0].track.info.artwork_url {
        embed = embed.thumbnail(track_artwork);
    }

    if let Some(info) = playlist_info {
        embed = embed.description(format!("{}", info.name));
        ctx.send(CreateReply::default().embed(embed)).await?;
    } else {
        let track = &tracks[0].track;

        if let Some(uri) = &track.info.uri {
            embed = embed.description(format!(
                "[{} - {}](<{}>)",
                track.info.author, track.info.title, uri
            ));
            ctx.send(CreateReply::default().embed(embed)).await?;
        } else {
            embed = embed.description(format!("{} - {}", track.info.author, track.info.title));
            ctx.send(CreateReply::default().embed(embed)).await?;
        }
    }

    for i in &mut tracks {
        i.track.user_data = Some(serde_json::json!({"requester_id": ctx.author().id.get()}));
    }

    for track in tracks {
        if player.get_player().await.is_ok_and(|x| x.track.is_none()) {
            player.play(&track.track).await?;
        } else {
            player.queue(track)?;
        }
    }

    Ok(())
}
