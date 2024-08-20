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
import { launch } from "puppeteer";
import { parse } from 'node-html-parser';
import { readFile } from "fs/promises";

export const data = new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Chat with Agent Kitten.')
        .addStringOption((option: SlashCommandStringOption) => option.setName('message').setDescription('The message to send to Agent Kitten.').setRequired(true))

function splitText(text: string, maxLength: number = 2000): string[] {
    // Splits text into chunks, ensuring each chunk is no longer than maxLength
    // and splits are done only at newline characters while preserving markdown formatting.
    // @param text - The text to be split
    // @param maxLength - Maximum length of each split chunk
    // @return A list of text chunks

    let lines = text.split(/\r?\n/); // Split the text by lines
    let chunks: string[] = []; // Array to store the resulting chunks
    let currentChunk = ""; // String to accumulate the current chunk
    let codeBlockOpen = false; // Boolean to track if we are inside a code block

    for (let line of lines) {
        // Check for code block markers and track their state
        if (line.trim().startsWith("```")) {
            codeBlockOpen = !codeBlockOpen;
        }

        // Check if adding the line would make the current chunk too long
        if ((currentChunk.length + line.length + 1) > maxLength) { // +1 for the newline character
            // If a code block is open, close it in the current chunk
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
            currentChunk += line + "\n"; // Add the line to the current chunk
        }
    }

    // Handle the last chunk and the case where the code block may still be open
    if (currentChunk.trim()) {
        if (codeBlockOpen) {
            currentChunk += "```";
        }
        chunks.push(currentChunk.trim());
    }

    return chunks; // Return the array of text chunks
}

async function executeEval(args: { code: string }) {
    const { code } = args;

    try {
        // Step 1: Read and parse tsconfig.json
        const tsconfigPath = '../tsconfig.json'; // Adjust the path as necessary
        const tsconfigRaw = await readFile(tsconfigPath, 'utf-8');
        const tsconfig = JSON.parse(tsconfigRaw);

        // Step 2: Get the compiler options from the tsconfig
        const compilerOptions = tsconfig.compilerOptions;

        // Step 3: Transpile the TypeScript code using the options from tsconfig
        const transpiledCode = ts.transpileModule(code, {
            compilerOptions: compilerOptions  // Apply the compiler options from tsconfig
        });

        // Create a new context for evaluation
        const context = vm.createContext({
            consoleOutput: null,
            console: {
                log: (output: any) => {
                    context.consoleOutput = output;
                }
            }
        });

        // Run the transpiled code in the new context
        const script = new vm.Script(transpiledCode.outputText);
        script.runInContext(context);

        // Check if any console output is captured
        if (context.consoleOutput !== null) {
            return String(context.consoleOutput);
        } else {
            return 'No console output captured';
        }
    } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
    }
}

async function searchGoogle(args: { query: string }): Promise<string> {
    const { query } = args;
    const searchResultsAmount = 3;
    const escapedTerm = encodeURIComponent(query);
    const url = `https://searx.clowdertech.com/search?q=${escapedTerm}&language=auto&time_range=&safesearch=0&categories=general&format=json`;

    let searchResults = '';
    let start = 0;

    const browser = await launch({headless: true, args: ["--no-sandbox"]},);
    const page = await browser.newPage();

    try {
        const response = await page.goto(url, { timeout: 30000, waitUntil: "load" });
        if (!response?.ok()) {
            return `Response not ok. Status ${response?.status()}.`;
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
    } finally {
        await browser.close();
    }

    return searchResults;
}

// Function to scrape a Cloudflare-protected site
async function scrapeWebsite(args: { url: string }): Promise<string> {
    const { url } = args;
    
    // Launch a headless Chromium browser with some parameters
    const browser = await launch({
        headless: true,  // Running in headful mode may help bypass some protections
        args: [
            "--no-sandbox"
        ]
    });

    const page = await browser.newPage();

    try {
        const response = await page.goto(url, { timeout: 30000, waitUntil: "load" }); // Navigate to the URL
        const content = await page.content(); // Get the page content

        if (!response?.ok()) {
            return `Response not ok. Status ${response?.status()}.`;
        }

        const root = parse(content); // Parse the content
        const anchors = root.querySelectorAll('a[href]'); // Find <a> tags

        anchors.forEach((a) => {
            const linkText = `[${a.text}](${a.getAttribute('href')})`; // Create link text
            a.replaceWith(linkText); // Replace <a> tag with link text
        });

        const textWithLinks = root.text; // Get the modified text
        return textWithLinks; // Return the modified text

    } catch (error) {
        console.error("Error scraping website:", error);
        return "Error occurred during scraping.";
    } finally {
        await browser.close(); // Ensure the browser is closed
    }
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

    let embeds = [];
    for (const chunk of splitText(response!, 4095)) {
        embeds.push(new EmbedBuilder().setAuthor({name: 'Agent Kitten', url: 'https://agentkitten.com', iconURL: 'https://cdn.discordapp.com/avatars/1169801069514194956/7d1ee663b3e0e10191bedb70a9f8d2af.webp?size=4096'}).setTitle("Response").setDescription(chunk).setColor('#2b2d31').setTimestamp());
    }

    await interaction.editReply({ embeds: embeds });
};
