use crate::{Context, Error};
use lavalink_rs::model::search::SearchEngines;
use lavalink_rs::model::track::TrackLoadData;
use lavalink_rs::player_context::TrackInQueue;

/// Play a song in the voice channel you are connected in.
#[poise::command(slash_command, prefix_command)]
pub async fn play(
    ctx: Context<'_>,
    #[description = "Search term or URL"]
    #[rest]
    term: String,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().unwrap();

    let has_joined = crate::music_helpers::_join(&ctx, guild_id, None).await?;

    let lava_client = ctx.data().lavalink.clone();

    let Some(player) = lava_client.get_player_context(guild_id.get()) else {
        ctx.say("Join the bot to a voice channel first.").await?;
        return Ok(());
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

    if let Some(info) = playlist_info {
        ctx.say(format!("Added playlist to queue: {}", info.name,))
            .await?;
    } else {
        let track = &tracks[0].track;

        if let Some(uri) = &track.info.uri {
            ctx.say(format!(
                "Added to queue: [{} - {}](<{}>)",
                track.info.author, track.info.title, uri
            ))
            .await?;
        } else {
            ctx.say(format!(
                "Added to queue: {} - {}",
                track.info.author, track.info.title
            ))
            .await?;
        }
    }

    for i in &mut tracks {
        i.track.user_data = Some(serde_json::json!({"requester_id": ctx.author().id.get()}));
    }

    let queue = player.get_queue();
    queue.append(tracks.into())?;

    if player.get_player().await.is_ok_and(|x| x.track.is_none())
        && queue.get_track(0).await.is_ok_and(|y| y.is_some())
    {
        player.skip()?;
    }

    if has_joined {
        return Ok(());
    }

    Ok(())
}
