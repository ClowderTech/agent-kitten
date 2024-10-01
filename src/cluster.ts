import { Client } from "discord-cross-hosting";
import { Cluster, ClusterManager } from "discord-hybrid-sharding";

const client = new Client({
	agent: "bot", // Agent is a unique identifier for the Client
	host: Deno.env.get("BRIDGE_HOST")!, // Domain without https
	port: parseInt(Deno.env.get("BRIDGE_PORT")!), // Proxy Connection (Replit) needs Port 443
	// handshake: true, When Replit or any other Proxy is used
	authToken: Deno.env.get("BRIDGE_TOKEN")!, // Auth Token for the Server
	rollingRestarts: true, // Enable, when bot should respawn when cluster list changes.
});

const manager = new ClusterManager(`${import.meta.dirname!}/bot.ts`, {
	totalShards: "auto",
	totalClusters: "auto",
	mode: "process",
	token: Deno.env.get("BOT_TOKEN")!,
}); // Some dummy Data
manager.on("clusterCreate", (cluster: Cluster) =>
	console.log(`Launched Cluster ${cluster.id}`),
);
manager.on("debug", console.log);

function gracefulShutdown() {
	console.log("Received shutdown signal, closing cluster...");
	client.close();
}

Deno.addSignalListener("SIGINT", gracefulShutdown);
Deno.addSignalListener("SIGTERM", gracefulShutdown);

function waitFor(duration: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, duration));
}

export async function start(): Promise<void> {
	await client.connect();

	client.listen(manager);

	let ran = false;
	while (!ran) {
		waitFor(5000);

		await client
			.requestShardData()
			.then(async (e) => {
				if (!e) return;
				if (!e.shardList) return;
				manager.totalShards = e.totalShards;
				manager.totalClusters = e.shardList.length;
				manager.shardList = e.shardList;
				manager.clusterList = e.clusterList;
				ran = true;
				await manager.spawn({ timeout: -1 });
			})
			.catch((e) => console.log(e));
	}
}
