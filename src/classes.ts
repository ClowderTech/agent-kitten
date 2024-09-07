import { Client, Collection, SlashCommandBuilder } from "discord.js";
import type { MongoClient } from "mongodb";
import type { Manager } from "moonlink.js";
import type { Ollama } from "ollama";
import type { ClusterClient, DjsDiscordClient } from "discord-hybrid-sharding";
import type { Shard } from "discord-cross-hosting";

export interface Command {
    data: SlashCommandBuilder;
    execute: Function
}

export interface ClientExtended extends Client {
    commands: Collection<string, Command>;
    ollama: Ollama;
    mongoclient: MongoClient;
    moonlink: Manager;
    cluster: ClusterClient<DjsDiscordClient>;
    machine: Shard;
}

export class UserMadeError extends Error {
    constructor(message: string) {
        super(message);

        this.name = this.constructor.name;

        Error.captureStackTrace(this, this.constructor);

        Object.setPrototypeOf(this, UserMadeError.prototype);

        this.message = message;

        this.stack = this.stack;

        this.name = "UserMadeError";
    }
}

export function generateRandomString(length: number): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charactersLength);
        result += characters.charAt(randomIndex);
    }
    
    return result;
}