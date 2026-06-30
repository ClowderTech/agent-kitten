use lavalink_rs::{hook, model::events, prelude::*};

#[hook]
pub async fn track_end(lava_client: LavalinkClient, _session_id: String, event: &events::TrackEnd) {
    let player_context = lava_client.get_player_context(event.guild_id).unwrap();
    if player_context.get_queue().get_count().await.unwrap() >= 1 {
        return;
    }
    let _ = player_context.close();
}
