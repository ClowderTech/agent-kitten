import { config } from 'dotenv';

config({override: true});

// Step 1: Check the value of process.env.RUN_TYPE
if (process.env.RUN_TYPE === "bridge") {
    if (!process.env.BRIDGE_TOKEN || !process.env.BOT_TOKEN) {
        console.error("Please provide an auth token and bot token in a .env file or as environment variables.");
        process.exit(1);
    }
    // Step 2: Require the file for RUN_TYPE 1
    const bridge = await import('./bridge.js'); // Path to the first file
    // Step 3: Execute the logic defined in file1
    await bridge.start(); // Assuming there is a start function to call
} else if (process.env.RUN_TYPE === "cluster") {
    if (!process.env.BOT_TOKEN || !process.env.LAVALINK_HOST || !process.env.LAVALINK_PASSWORD || !process.env.LAVALINK_PORT || !process.env.LAVALINK_SECURE || !process.env.MONGODB_URI || !process.env.OPENAI_API_KEY || !process.env.OPENAI_ORG_ID || !process.env.BRIDGE_TOKEN) {
        console.error("Please provide a token, lavalink host, lavalink password, mongodb uri, openai api key and organization id in a .env file or as environment variables.");
        process.exit(1);
    }
    // Step 2: Require the file for RUN_TYPE 0
    const cluster = await import('./cluster.js'); // Path to the second file
    // Step 3: Execute the logic defined in file2
    await cluster.start(); // Assuming there is a start function to call
} else {
    console.log('Invalid RUN_TYPE');
}