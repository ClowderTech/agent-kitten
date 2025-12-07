// src/mongo_helpers.rs
use futures::stream::TryStreamExt;
use mongodb::{
    Client, Collection,
    bson::{Bson, Document, doc, to_document},
};
use serde::{Serialize, de::DeserializeOwned};
use std::error::Error;

/// A small wrapper containing a mongo `Client` plus the bot name used to derive DB name.
#[derive(Clone)]
pub struct MongoClient {
    pub client: Client,
    /// the bot name (used to generate the database name)
    pub bot_name: String,
}

impl MongoClient {
    pub fn new(client: Client, bot_name: String) -> Self {
        Self { client, bot_name }
    }

    /// Generate a MongoDB-safe database name (lowercase, only ascii-alnum + underscore, max 63 chars)
    fn database_name(&self) -> String {
        generate_database_name(&self.bot_name)
    }

    /// Internal helper: typed collection for T.
    fn collection_for<T>(&self, collection_name: &str) -> Collection<T>
    where
        T: Serialize + DeserializeOwned + Unpin + Send + Sync,
    {
        let db_name = self.database_name();
        self.client.database(&db_name).collection(collection_name)
    }

    /// Get documents matching `filter` from a typed collection.
    /// Pass `None` for an empty filter (returns everything).
    pub async fn get_data<T>(
        &self,
        collection_name: &str,
        filter: Option<Document>,
    ) -> Result<Vec<T>, DynError>
    where
        T: Serialize + DeserializeOwned + Unpin + Send + Sync,
    {
        let coll = self.collection_for::<T>(collection_name);
        let filter = filter.unwrap_or_else(|| doc! {});
        let mut cursor = coll.find(filter).await?;
        let mut results = Vec::new();
        while let Some(item) = cursor.try_next().await? {
            results.push(item);
        }
        Ok(results)
    }

    /// Set (insert or update) a document.
    /// - If `id_filter` is provided it will be used for update/upsert.
    /// - Otherwise, if `data` contains an `_id`, that `_id` will be used for update/upsert.
    /// - Otherwise, if no filter and no `_id` -> insert.
    ///
    /// `mode` chooses between Replace (full document replacement) or Patch (`$set`) semantics.
    ///
    /// Returns `SetOutcome` indicating whether an insert or update occurred.
    pub async fn set_data<T>(
        &self,
        collection_name: &str,
        data: &T,
        id_filter: Option<Document>, // optional filter or {"_id": oid}
        mode: SetMode,
    ) -> Result<SetOutcome, DynError>
    where
        T: Serialize + DeserializeOwned + Unpin + Send + Sync,
    {
        // Convert `data` to a Document so we can inspect and modify `_id` when necessary.
        // We'll use this `payload_doc` for both patch and replace flows (but for patch we'll delegate to typed collection).
        let mut payload_doc = to_document(data)?;

        // Determine filter (either the explicit id_filter or an `_id` inside the payload).
        let mut filter = id_filter;

        if filter.is_none()
            && let Some(b) = payload_doc.get("_id").cloned()
        {
            // If data contains an _id and no explicit filter provided, use it as the filter.
            filter = Some(doc! { "_id": b });
        }

        match mode {
            SetMode::Patch => {
                payload_doc.remove("_id");

                if let Some(filter_doc) = filter {
                    // typed collection for T
                    let coll_typed = self.collection_for::<T>(collection_name);

                    let update_doc = doc! { "$set": payload_doc };

                    // builder-style: chain upsert(true) then await
                    let res = coll_typed
                        .update_one(filter_doc, update_doc)
                        .upsert(true)
                        .await?;

                    if let Some(upserted) = res.upserted_id {
                        Ok(SetOutcome::Inserted { id: upserted })
                    } else {
                        Ok(SetOutcome::Updated {
                            modified_count: res.modified_count,
                        })
                    }
                } else {
                    // No filter and no _id => plain insert.
                    let db_name = self.database_name();
                    let doc_coll: Collection<Document> =
                        self.client.database(&db_name).collection(collection_name);
                    let insert_res = doc_coll.insert_one(payload_doc).await?;
                    Ok(SetOutcome::Inserted {
                        id: insert_res.inserted_id,
                    })
                }
            }

            SetMode::Replace => {
                if let Some(ref f) = filter
                    && let Some(filter_id) = f.get("_id").cloned()
                    && !payload_doc.contains_key("_id")
                {
                    payload_doc.insert("_id".to_string(), filter_id);
                }

                let db_name = self.database_name();
                let doc_coll: Collection<Document> =
                    self.client.database(&db_name).collection(collection_name);

                if let Some(filter_doc) = filter {
                    // builder-style replace with upsert(true)
                    let result = doc_coll
                        .replace_one(filter_doc, payload_doc)
                        .upsert(true)
                        .await?;

                    if let Some(upserted) = result.upserted_id {
                        Ok(SetOutcome::Inserted { id: upserted })
                    } else {
                        Ok(SetOutcome::Updated {
                            modified_count: result.modified_count,
                        })
                    }
                } else {
                    let insert_res = doc_coll.insert_one(payload_doc).await?;
                    Ok(SetOutcome::Inserted {
                        id: insert_res.inserted_id,
                    })
                }
            }
        }
    }

    /// Delete a document by ObjectId or by filter Document.
    /// Returns `true` if a document was deleted.
    pub async fn delete_data(
        &self,
        collection_name: &str,
        id_or_filter: Document, // caller passes either {"_id": oid} or any filter
    ) -> Result<bool, DynError> {
        // Using `Document` makes the API flexible: the caller may easily pass `doc!{ "_id": oid }`
        let db_name = self.database_name();
        let coll = self
            .client
            .database(&db_name)
            .collection::<Document>(collection_name);
        let res = coll.delete_one(id_or_filter).await?;
        Ok(res.deleted_count > 0)
    }
}

/// Generate database name from bot name (same rules as your TS helper).
pub fn generate_database_name(bot_name: &str) -> String {
    let mut db = bot_name.to_lowercase();
    db.retain(|c| c.is_ascii_alphanumeric() || c == '_');
    if db.len() > 63 {
        db.truncate(63);
    }
    db
}

/// Outcome from `set_data`.
#[derive(Debug)]
pub enum SetOutcome {
    /// An insert (new document) happened; contains the inserted id (Bson; usually ObjectId).
    Inserted { id: Bson },
    /// An update happened (may be zero if nothing changed); contains the modified_count.
    Updated { modified_count: u64 },
}

pub type DynError = Box<dyn Error + Send + Sync>;

/// Mode for `set_data`: full replace vs patch (partial update with $set).
#[derive(Debug, Clone, Copy)]
pub enum SetMode {
    /// Replace the entire document (use `replace_one(..., upsert=true)`).
    Replace,
    /// Patch the document using `$set` (use `update_one(..., $set, upsert=true)`).
    Patch,
}
