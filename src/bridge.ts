import { Bridge } from "discord-cross-hosting";

const server = new Bridge({
	port: parseInt(process.env.BRIDGE_PORT!), // The Port of the Server | Proxy Connection (Replit) needs Port 443
	authToken: process.env.BRIDGE_TOKEN!, // The Auth Token for the Server
	totalShards: "auto", // The Total Shards of the Bot or 'auto'
	totalMachines: 3, // The Total Machines, where the Clusters will run
	shardsPerCluster: 2, // The amount of Internal Shards, which are in one Cluster
	token: process.env.BOT_TOKEN!, // The Bot Token
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
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

export async function start(): Promise<void> {
	await server.start();
}
