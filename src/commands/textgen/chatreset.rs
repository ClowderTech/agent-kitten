use crate::{Context, Error};
use mongodb::bson::doc;

use poise::CreateReply;

#[poise::command(slash_command, prefix_command)]
pub async fn chatreset(ctx: Context<'_>) -> Result<(), Error> {
    let mongoclient = ctx.data().mongoclient.clone();

    let filter = doc! { "userid": ctx.author().id.get().to_string() };
    let deleted = mongoclient.delete_data("textgen", filter.clone()).await?;

    if deleted {
        ctx.send(
            CreateReply::default()
                .content("Your chat data has been reset.")
                .ephemeral(true),
        )
        .await?;
    } else {
        ctx.send(
            CreateReply::default()
                .content("You already had no chat data.")
                .ephemeral(true),
        )
        .await?;
    }

    Ok(())
}
