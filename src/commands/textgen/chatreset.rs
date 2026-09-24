use crate::{
    Context, Error,
    entity::textgen::{Entity as Textgen, Model as TextgenModel},
};
// use mongodb::bson::doc;

use poise::CreateReply;
use sea_orm::ModelTrait;

/// Reset your chat logs for Agent Kitten
#[poise::command(
    slash_command,
    install_context = "Guild|User",
    interaction_context = "Guild|BotDm|PrivateChannel"
)]
pub async fn chatreset(ctx: Context<'_>) -> Result<(), Error> {
    // let mongoclient = ctx.data().mongoclient.clone();

    // let filter = doc! { "userid": ctx.author().id.get().to_string() };
    // let deleted = mongoclient.delete_data("textgen", filter.clone()).await?;

    let psql_client = &ctx.data().psql_client;

    let user_id = ctx.author().id.to_string();

    let user_content_search: Option<TextgenModel> = Textgen::find_by_user_id(user_id.clone())
        .one(psql_client)
        .await?;

    match user_content_search {
        Some(content) => {
            content.delete(psql_client).await?;
            ctx.send(
                CreateReply::default()
                    .content("Your chat data has been reset.")
                    .ephemeral(false),
            )
            .await?;
        }
        None => {
            ctx.send(
                CreateReply::default()
                    .content("You already had no chat data.")
                    .ephemeral(false),
            )
            .await?;
        }
    };

    Ok(())
}
