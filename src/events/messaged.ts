import { Events, Message } from "discord.js";

export const eventType: Events = Events.MessageCreate;

export const once = false;

export async function execute(message: Message) {
    if (message.author.bot) return;

    if (message.content.startsWith(`<@${message.client.user.id}>`)) {
        await message.reply({content: "I can now only use slash commands to execute commands."})
    }
};