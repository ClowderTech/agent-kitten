import { config } from "dotenv";

config({ override: true });

// Step 1: Check the value of process.env.RUN_TYPE
if (Deno.env.get("RUN_TYPE") === "bridge") {
	if (!Deno.env.get("BRIDGE_TOKEN") || !Deno.env.get("BOT_TOKEN")) {
		console.error(
			"Please provide an auth token and bot token in a .env file or as environment variables.",
		);
		Deno.exit(1);
	}
	// Step 2: Require the file for RUN_TYPE 1
	const bridge = await import("./bridge.ts"); // Path to the first file
	// Step 3: Execute the logic defined in file1
	await bridge.start(); // Assuming there is a start function to call
} else if (Deno.env.get("RUN_TYPE") === "cluster") {
	if (
		!Deno.env.get("BOT_TOKEN") ||
		!Deno.env.get("LAVALINK_HOST") ||
		!Deno.env.get("LAVALINK_PASSWORD") ||
		!Deno.env.get("LAVALINK_PORT") ||
		!Deno.env.get("LAVALINK_SECURE") ||
		!Deno.env.get("MONGODB_URI") ||
		!Deno.env.get("OPENAI_API_KEY") ||
		!Deno.env.get("OPENAI_ORG_ID") ||
		!Deno.env.get("BRIDGE_TOKEN")
	) {
		console.error(
			"Please provide a token, lavalink host, lavalink password, mongodb uri, openai api key and organization id in a .env file or as environment variables.",
		);
		Deno.exit(1);
	}
	// Step 2: Require the file for RUN_TYPE 0
	const cluster = await import("./cluster.ts"); // Path to the second file
	// Step 3: Execute the logic defined in file2
	await cluster.start(); // Assuming there is a start function to call
} else {
	console.log("Invalid RUN_TYPE");
}
