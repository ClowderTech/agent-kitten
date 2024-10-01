import { Bridge } from "discord-cross-hosting";

import * as mod from "node:process";

const server = new Bridge({
	port: parseInt(mod.env.BRIDGE_PORT!), // The Port of the Server | Proxy Connection (Replit) needs Port 443
	authToken: mod.env.BRIDGE_TOKEN!, // The Auth Token for the Server
	totalShards: "auto", // The Total Shards of the Bot or 'auto'
	totalMachines: 3, // The Total Machines, where the Clusters will run
	shardsPerCluster: 2, // The amount of Internal Shards, which are in one Cluster
	token: mod.env.BOT_TOKEN!, // The Bot Token
	retries: 5, // The amount of Retries, when the Serler is not reachable
	listenOptions: {
		host: "0.0.0.0",
	},
});

server.on("ready", (url: string) => {
	console.log("Server is ready " + url);
	setInterval(() => {
		server
			.broadcastEval("this.guilds.cache.size")
			.then(console.log)
			.catch(console.log);
	}, 10000);
});

server.on("debug", console.log);

function gracefulShutdown() {
	console.log("Received shutdown signal, closing bridge...");
	server.close();
	mod.exit(0);
}

Deno.addSignalListener("SIGINT", gracefulShutdown);
Deno.addSignalListener("SIGTERM", gracefulShutdown);

export async function start(): Promise<void> {
	await server.start();
}
