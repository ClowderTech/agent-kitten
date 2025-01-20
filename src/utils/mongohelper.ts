// mongoHelpers.ts
import {
	Collection,
	type Document,
	type Filter,
	ObjectId,
	type WithId,
} from "mongodb";
import type { ClientExtended } from "./classes.ts";

function generateDatabaseName(botName: string): string {
	// Step 1: Lowercase the bot name
	let databaseName = botName.toLowerCase();

	// Step 2: Replace spaces with underscores and remove special characters
	// Regular expression to replace any non-alphanumeric character (excluding underscores)
	databaseName = databaseName.replace(/[^a-z0-9_]/g, "");

	// Step 3: Ensure the name adheres to MongoDB naming conventions
	// MongoDB database names can be 0-63 characters long, so we can truncate if needed
	if (databaseName.length > 63) {
		databaseName = databaseName.substring(0, 63);
	}

	return databaseName;
}

// Get a specific collection from MongoDB
function getCollection(
	client: ClientExtended,
	collectionName: string
): Collection {
	return client.mongoclient
		.db(generateDatabaseName(client.user?.username || "Unknown"))
		.collection(collectionName);
}

// Get Data Function
export async function getData(
	client: ClientExtended,
	collectionName: string,
	query: ObjectId | Filter<Document>
) {
	try {
		const collection = getCollection(client, collectionName);
		const result = await collection.find(query).toArray();
		return result;
	} catch (error) {
		console.error(`Error fetching data: ${error}`);
		throw new Error("Could not fetch data");
	}
}

// Set Data Function (Insert or Update)
export async function setData(
	client: ClientExtended,
	collectionName: string,
	data: WithId<Document>,
	id?: ObjectId | Filter<Document>
) {
	try {
		const collection = getCollection(client, collectionName);

		if (!id) {
			if (data._id) {
				id = data._id as ObjectId;
			} else {
				id = new ObjectId();
			}
		}

		if (id) {
			const result = await collection.updateOne(
				id instanceof ObjectId ? { _id: id } : id,
				{ $set: data },
				{ upsert: true }
			);
			return result.modifiedCount > 0; // Return true if a document was modified
		} else {
			const result = await collection.insertOne(data);
			return result.insertedId; // Return the newly inserted ID
		}
	} catch (error) {
		console.error(`Error setting data: ${error}`);
		throw new Error("Could not set data");
	}
}

// List Data Function
export async function listData(
	client: ClientExtended,
	collectionName: string,
	filter: Filter<Document> = {}
) {
	try {
		const collection = getCollection(client, collectionName);
		const result = await collection.find(filter).toArray();
		return result;
	} catch (error) {
		console.error(`Error listing data: ${error}`);
		throw new Error("Could not list data");
	}
}

// Delete Data Function
export async function deleteData(
	client: ClientExtended,
	collectionName: string,
	id: ObjectId | Filter<Document>
) {
	try {
		const collection = getCollection(client, collectionName);

		if (id) {
			// Determine if id is a string or ObjectId and convert if necessary
			const result = await collection.deleteOne(
				id instanceof ObjectId ? { _id: id } : id
			);
			return result.deletedCount > 0; // Return true if a document was modified
		}
	} catch (error) {
		console.error(`Error deleting data: ${error}`);
		throw new Error("Could not delete data");
	}
}
