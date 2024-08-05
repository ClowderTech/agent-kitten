import { Client, Collection, SlashCommandBuilder } from "discord.js";
import { Kazagumo } from "kazagumo";

export interface Command {
    data: SlashCommandBuilder;
    execute: Function
}

export interface ClientExtended extends Client {
    commands: Collection<string, Command>;
    kazagumo: Kazagumo;
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