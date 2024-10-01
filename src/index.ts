import { config } from "dotenv";
import * as mod from "node:process";

config({ override: true });

// Step 1: Check the value of process.env.RUN_TYPE
if (mod.env.RUN_TYPE === "bridge") {
	if (!mod.env.BRIDGE_TOKEN || !mod.env.BOT_TOKEN) {
		console.error(
			"Please provide an auth token and bot token in a .env file or as environment variables.",
		);
		mod.exit(1);
	}
	// Step 2: Require the file for RUN_TYPE 1
	const bridge = await import("./bridge.ts"); // Path to the first file
	// Step 3: Execute the logic defined in file1
	await bridge.start(); // Assuming there is a start function to call
} else if (mod.env.RUN_TYPE === "cluster") {
	if (
		!mod.env.BOT_TOKEN ||
		!mod.env.LAVALINK_HOST ||
		!mod.env.LAVALINK_PASSWORD ||
		!mod.env.LAVALINK_PORT ||
		!mod.env.LAVALINK_SECURE ||
		!mod.env.MONGODB_URI ||
		!mod.env.OPENAI_API_KEY ||
		!mod.env.OPENAI_ORG_ID ||
		!mod.env.BRIDGE_TOKEN
	) {
		console.error(
			"Please provide a token, lavalink host, lavalink password, mongodb uri, openai api key and organization id in a .env file or as environment variables.",
		);
		mod.exit(1);
	}
	// Step 2: Require the file for RUN_TYPE 0
	const cluster = await import("./cluster.ts"); // Path to the second file
	// Step 3: Execute the logic defined in file2
	await cluster.start(); // Assuming there is a start function to call
} else {
	console.log("Invalid RUN_TYPE");
}
