import { Client } from "discord-cross-hosting";
import { Cluster, ClusterManager } from "discord-hybrid-sharding";
import { generateRandomString } from "./classes.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

const client = new Client({
    agent: "bot", // Agent is a unique identifier for the Client
    host: process.env.BRIDGE_HOST!, // Domain without https
    port: parseInt(process.env.BRIDGE_PORT!), // Proxy Connection (Replit) needs Port 443
    // handshake: true, When Replit or any other Proxy is used
    authToken: process.env.BRIDGE_TOKEN!, // Auth Token for the Server
    rollingRestarts: false, // Enable, when bot should respawn when cluster list changes.
});

const manager = new ClusterManager(`${__dirname}/bot.js`, { totalShards: 2, totalClusters: 1, mode: "process", token: process.env.BOT_TOKEN!}); // Some dummy Data
manager.on('clusterCreate', (cluster: Cluster) => console.log(`Launched Cluster ${cluster.id}`));
manager.on('debug', console.log);

export async function start(): Promise<void> {
    await client.connect();

    client.listen(manager);
    await client
        .requestShardData()
        .then(async e => {
            if (!e) return;
            if (!e.shardList) return;
            manager.totalShards = e.totalShards;
            manager.totalClusters = e.shardList.length;
            manager.shardList = e.shardList;
            manager.clusterList = e.clusterList;
            await manager.spawn({ timeout: -1 });
        })
        .catch(e => console.log(e));
}