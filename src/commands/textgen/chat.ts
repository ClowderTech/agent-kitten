import { EmbedBuilder, CommandInteraction, SlashCommandBuilder, User, Team, TeamMember, SlashCommandStringOption} from "discord.js";
import OpenAI from "openai";
import type { ClientExtended } from "../../classes";
import { transpile } from "typescript";
import * as fs from 'fs/promises'; // Importing the 'fs/promises' namespace for promise-based file system operations
import { exec } from 'child_process';
import { promisify } from 'util';
import { ObjectId } from "mongodb";
import { JSDOM } from 'jsdom';
import * as ts from 'typescript';
import * as vm from 'vm';




export const data = new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Chat with Agent Kitten.')
        .addStringOption((option: SlashCommandStringOption) => option.setName('message').setDescription('The message to send to Agent Kitten.').setRequired(true))

function splitText(text: string, maxLength: number = 2000): string[] {
    /**
     * Splits text into chunks, ensuring each chunk is no longer than maxLength
     * and splits are done only at newline characters while preserving markdown formatting.
     * @param text - The text to be split
     * @param maxLength - Maximum length of each split chunk
     * @return A list of text chunks
     */
    
    let lines = text.split(/\r?\n/); // Split the text by lines
    let chunks: string[] = [];
    let currentChunk = "";
    let codeBlockOpen = false;

    for (let line of lines) {
        // Check for code block markers and track their state
        if (line.trim().startsWith("```")) {
            codeBlockOpen = !codeBlockOpen;
        }

        // Check if adding the line would make the current chunk too long
        if ((currentChunk.length + line.length + 1) > maxLength) { // +1 for the newline character
            // If a code block is open, close it in the current chunk and reopen in the next
            if (codeBlockOpen) {
                currentChunk += "```\n";
                chunks.push(currentChunk.trim());

                // Reopen in the next chunk
                currentChunk = "```\n" + line + "\n";
            } else {
                chunks.push(currentChunk.trim());
                currentChunk = line + "\n";
            }
        } else {
            currentChunk += line + "\n";
        }
    }

    // Handle the last chunk and the case where the code block may still be open
    if (currentChunk.trim()) {
        if (codeBlockOpen) {
            currentChunk += "```";
        }
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

async function executeEval(args: { code: string }) {
    const { code } = args;
    try {
        // Transpile TypeScript code to JavaScript
        const transpiledCode = ts.transpileModule(code, {
            compilerOptions: { module: ts.ModuleKind.ESNext }
        });

        // Create a new context for the evaluation
        const context = vm.createContext({
            consoleOutput: null, // To capture console.log output
            console: {
                log: (output: any) => {
                    context.consoleOutput = output;
                }
            }
        });

        // Run the transpiled JavaScript code in the new context
        const script = new vm.Script(transpiledCode.outputText);
        script.runInContext(context);

        // Check if any console output is captured
        if (context.consoleOutput !== null) {
            return String(context.consoleOutput);
        } else {
            return 'No console output captured';
        }
    } catch (error) {
        // Properly type-cast `error` to `Error` for accessing `message` property
        if (error instanceof Error) {
            return `Error: ${error.message}`;
        }
        return 'Unknown error occurred';
    }
}

async function searchGoogle(args: { query: string }): Promise<string> {
    const { query } = args;
    const searchResultsAmount = 3;
    const escapedTerm = encodeURIComponent(query);
    const url = `https://searx.clowdertech.com/search?q=${escapedTerm}&language=auto&time_range=&safesearch=0&categories=general&format=json`;

    let searchResults = '';
    let start = 0;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return `Response not ok. Status ${response.status}.`;
        }
        const data = await response.json();
        const results = data.results;
        for (const result of results) {
            searchResults += `[${start + 1}] ${result.url} || ${result.content}\n`;
            start += 1;
            if (start === searchResultsAmount) {
                break;
            }
        }
    } catch (error) {
        return `An error occurred: ${error}`;
    }

    return searchResults;
}

async function scrapeWebsite(args: { url: string }): Promise<string> {
    const { url } = args;
    const response = await fetch(url);
    const text = await response.text();

    const dom = new JSDOM(text);
    const document = dom.window.document;

    const anchorTags = document.querySelectorAll('a[href]');

    anchorTags.forEach((a: any) => {
        const linkText = `[${a.textContent}](${a.getAttribute('href')})`;
        const textNode = document.createTextNode(linkText);
        a.parentNode.replaceChild(textNode, a);
    });

    return document.body.textContent?.substring(0, ) || 'No output.';
}

export async function execute(interaction: CommandInteraction) {
    const message = interaction.options.get('message', true).value?.toString()!;

    const client = interaction.client as ClientExtended;

    const openai = client.openai;
    
    const mongoclient = client.mongoclient;

    await interaction.deferReply();

    const db = mongoclient.db('agentkitten');

    const collection = db.collection('textgen');

    let user_data = await collection.findOne({ user_id: interaction.user.id });

    if (!user_data) {
        user_data = {
            _id: new ObjectId(), // Add the _id property
            user_id: interaction.user.id,
            messages: [
                {
                    role: 'system',
                    content: 'You are Agent Kitten, a helpful AI powered discord bot made by the ClowderTech LLC. You are here to help people with their problems. You can access the internet using the search command and scrape websites using the scrape command. You can also execute code using the eval command, which executes typescript code. Your own website is https://agentkitten.com. Also, make sure to walk through the user all the steps you did to get your answer before giving the full answer, especially if you are fixing or creating a users code or doing a math problem. For instance with coding, write out the steps you would take to fix or create the code before giving the code and then adding comments of what youre doing on that line before writing the line of code.'
                }
            ]
        };
    }

    user_data.messages.push({
        role: 'user',
        content: message
    });

    console.log(user_data.messages);

    const runner = openai.beta.chat.completions.runTools({
        // model: 'mixtral:8x7b',
        model: 'gpt-4o-mini',
        // model: "llama3.1:8b",
        messages: user_data.messages,
        tools: [
            {
                type: "function",
                function: {
                    name: "eval",
                    function: executeEval,
                    parse: JSON.parse,
                    description: "Execute TypeScript code. Use console.log to output data. Make sure to not use infinite loops, do anything illegal, try to retrieve credentials, or access anything about your code.",
                    parameters: {
                        type: "object",
                        properties: {
                            code: {
                                type: "string", 
                                description: "The code to execute."
                            }
                        },
                        required: ["code"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "search",
                    function: searchGoogle,
                    parse: JSON.parse,
                    description: "Search on Google.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "The search query."
                            }
                        },
                        required: ["query"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "scrape",
                    function: scrapeWebsite,
                    parse: JSON.parse,
                    description: "Scrape a website.",
                    parameters: {
                        type: "object",
                        properties: {
                            url: {
                                type: "string",
                                description: "The URL of the website to scrape."
                            }
                        },
                        required: ["url"]
                    }
                }
            }
        ] 
    });
    
    const response = await runner.finalContent(); // Execute the chat completion and get the response
    
    user_data.messages = runner.messages; // Log the messages for debugging

    delete user_data.messages[user_data.messages.length - 1].tool_calls

    await collection.updateOne({ user_id: interaction.user.id }, { $set: user_data }, { upsert: true });

    for (const chunk of splitText(response!, 1900)) {
        await interaction.followUp(chunk) // Handle the response as needed
    }

};
