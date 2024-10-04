import {
	EmbedBuilder,
	SlashCommandBuilder,
	SlashCommandStringOption,
	ApplicationCommandOptionType,
	ChatInputCommandInteraction,
	Message as DiscordMessage,
} from "discord.js";
import type { ClientExtended } from "../../utils/classes.ts";
import { WithId, Document } from "mongodb";
import * as ts from "typescript";
import * as vm from "node:vm";
import { launch } from "puppeteer";
import { chatWithFuncs, convertBlobToUint8Array } from "../../utils/textgen.ts";
import { ChatRequest } from "ollama";
import { parse } from "node-html-parser";
import { getData, setData } from "../../utils/mongohelper.ts";

export const data = new SlashCommandBuilder()
	.setName("chat")
	.setDescription("Chat with Agent Kitten.")
	.addStringOption((option: SlashCommandStringOption) =>
		option
			.setName("message")
			.setDescription("The message to send to Agent Kitten.")
			.setRequired(true),
	)
	.addAttachmentOption((option) =>
		option
			.setName("attachment1")
			.setDescription("An attachment to send to Agent Kitten.")
			.setRequired(false),
	)
	.addAttachmentOption((option) =>
		option
			.setName("attachment2")
			.setDescription("An attachment to send to Agent Kitten.")
			.setRequired(false),
	)
	.addAttachmentOption((option) =>
		option
			.setName("attachment3")
			.setDescription("An attachment to send to Agent Kitten.")
			.setRequired(false),
	)
	.addAttachmentOption((option) =>
		option
			.setName("attachment4")
			.setDescription("An attachment to send to Agent Kitten.")
			.setRequired(false),
	)
	.addAttachmentOption((option) =>
		option
			.setName("attachment5")
			.setDescription("An attachment to send to Agent Kitten.")
			.setRequired(false),
	);

// Function to split text into chunks for Discord embeds while handling code blocks and other formatting
function splitText(text: string, maxLength: number = 2000): string[] {
	// Initialize variables
	const lines = text.split(/\r?\n/); // Split the text by lines
	const chunks: string[] = []; // Array to store the resulting chunks
	let currentChunk = ""; // String to accumulate the current chunk
	let codeBlockOpen = false; // Boolean to track if we are inside a code block

	// Function to safely push a chunk and handle reopen code block if needed
	const pushChunk = () => {
		if (codeBlockOpen) {
			currentChunk += "```\n"; // Close the code block in the current chunk
			chunks.push(currentChunk.trim()); // Add trimmed chunk to the array
			currentChunk = "```\n"; // Reopen code block in the next chunk
		} else {
			chunks.push(currentChunk.trim()); // Add trimmed chunk to the array
			currentChunk = ""; // Reset the current chunk
		}
	};

	// Iterate through each line in the text
	for (const line of lines) {
		// Track code block state
		if (line.trim().startsWith("```")) {
			codeBlockOpen = !codeBlockOpen;
		}

		// Check if adding the line would exceed the chunk's max length
		if (currentChunk.length + line.length + 1 > maxLength) {
			// +1 for the newline character
			pushChunk(); // Push the current chunk to the array
			currentChunk += line + "\n"; // Start a new chunk with the current line
		} else {
			currentChunk += line + "\n"; // Add the line to the current chunk
		}
	}

	// Handle the final chunk
	if (currentChunk.trim()) {
		if (codeBlockOpen) {
			currentChunk += "```"; // Close any open code block
		}
		chunks.push(currentChunk.trim()); // Add the final chunk to the array
	}

	return chunks; // Return the array of text chunks
}

function executeEval(code: string) {
	code.replace("\\n", "\n");
	code.replace("\\t", "\t");

	try {
		// Define the tsconfig object directly with the correct types
		const tsconfig = {
			compilerOptions: {
				lib: ["ESNext", "DOM"],
				target: ts.ScriptTarget.ESNext,
				module: ts.ModuleKind.None, // Ensure no module system
				noEmitHelpers: true, // Try to prevent additional helper functions
				allowJs: true,
				noEmit: true, // Change to true if we don’t want to emit files
				strict: true,
				skipLibCheck: true,
			},
		};

		// Step 2: Get the compiler options from the tsconfig
		const compilerOptions = tsconfig.compilerOptions; // Extract compilerOptions

		// Step 3: Transpile the TypeScript code using the options from tsconfig
		const transpiledCode = ts.transpileModule(code, {
			// Transpile the code
			compilerOptions: compilerOptions, // Apply the compiler options from tsconfig
		});

		// Step 4: Create a new context for evaluation
		const context = vm.createContext({
			// Creating a new VM context
			consoleOutput: null, // We will store console output here
			console: {
				// Override the console methods
				log: (output: unknown) => {
					context.consoleOutput = output; // Capture console logs
				},
			},
		});

		// Run the transpiled code in the new context
		const script = new vm.Script(transpiledCode.outputText); // Create a new script from the output
		script.runInContext(context); // Run the script in the VM context

		// Step 5: Check if any console output is captured
		if (context.consoleOutput !== null) {
			return String(context.consoleOutput); // Return the console output as a string
		} else {
			return "No console output captured"; // If nothing was outputted
		}
	} catch (error) {
		// Handle errors
		return `Error: ${error || "Unknown error occurred"}`; // Return the error message
	}
}

async function searchGoogle(query: string): Promise<string> {
	const searchResultsAmount = 3;
	const escapedTerm = encodeURIComponent(query);
	const url = `https://searx.clowdertech.com/search?q=${escapedTerm}&language=auto&time_range=&safesearch=0&categories=general&format=json`;

	let searchResults = "";
	let start = 0;

	const browser = await launch({ headless: true, args: ["--no-sandbox"] });
	const page = await browser.newPage();

	try {
		const response = await page.goto(url, {
			timeout: 30000,
			waitUntil: "load",
		});
		if (!response?.ok()) {
			return `Response not ok. Status ${response?.status()}.`;
		}
		const data = await response.json();
		const results = data.results;
		for (const result of results) {
			searchResults += `[${start + 1}] ${result.url} || ${
				result.content
			}\n`;
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
async function scrapeWebsite(url: string): Promise<string> {
	// Launch a headless Chromium browser with some parameters
	const browser = await launch({
		headless: true, // Running in headful mode may help bypass some protections
		args: ["--no-sandbox"],
	});

	const page = await browser.newPage();

	try {
		const response = await page.goto(url, {
			timeout: 30000,
			waitUntil: "load",
		}); // Navigate to the URL
		const content = await page.content(); // Get the page content

		if (!response?.ok()) {
			return `Response not ok. Status ${response?.status()}.`;
		}

		const root = parse(content); // Parse the content
		const anchors = root.querySelectorAll("a[href]"); // Find <a> tags

		anchors.forEach((a) => {
			const linkText = `[${a.text}](${a.getAttribute("href")})`; // Create link text
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

export async function execute(interaction: ChatInputCommandInteraction) {
	const client = interaction.client as ClientExtended;

	const ollama = client.ollama;

	await interaction.deferReply();

	const message = interaction.options.getString("message", true); // Get the message content

	const attachments =
		interaction.options.data
			.filter(
				(option) =>
					option.type === ApplicationCommandOptionType.Attachment,
			)
			.map((option) => option.attachment!) || []; // Get the attachment objects

	// Loop through each attachment and process it
	const attachmentContents: string[] = [];
	const attachmentURLs: string[] = [];

	for (const attachment of attachments) {
		try {
			const response = await fetch(attachment.url); // Fetch the attachment

			if (!response.ok) {
				console.error(
					`Failed to fetch attachment: ${response.status} ${response.statusText}`,
				);
				continue;
			}

			const contentType = attachment.contentType; // Get the content type

			// Check if the content type is text
			if (
				contentType &&
				(contentType.includes("text") ||
					contentType.includes("; charset=utf-8"))
			) {
				const text = await response.text(); // Read the text content
				attachmentContents.push(text); // Add the text content to the array
			} else if (
				contentType &&
				(contentType.includes("image") || contentType.includes("video"))
			) {
				const image = await convertBlobToUint8Array(
					await response.blob(),
				);

				const { chat_response } = await chatWithFuncs(ollama, {
					model: "moondream:1.8b",
					messages: [
						{
							role: "user",
							content: "Describe this image or video in detail.",
							images: [image],
						},
					],
				});

				console.log(chat_response.message.content);

				attachmentURLs.push(chat_response.message.content);
			}
		} catch (error) {
			console.error("Error processing attachment:", error);
		}
	}

	// Step 3: Create the prefix string
	const textPrefix: string = "\n\nText Attachments:\n\n";
	const imagePrefix: string = "\n\nImage Attachments:\n\n";

	// Step 4: Initialize newMessage with the original message
	let newMessage: string = message;

	// Step 5: Check if there are attachments before appending
	if (attachmentContents.length > 0) {
		// If there are attachments
		const attachmentsString: string = attachmentContents.join("\n\n"); // Join the attachment contents
		newMessage += textPrefix + attachmentsString; // Append prefix and attachments to the message
	}
	if (attachmentURLs.length > 0) {
		const attachmentsString: string = attachmentURLs.join("\n\n");
		newMessage += imagePrefix + attachmentsString;
	}

	const chatData = await getData(client, "textgen", {
		userId: interaction.user.id,
	});

	let user_data: WithId<Document> | Record<string | number | symbol, unknown>;

	if (!chatData[0]) {
		user_data = {
			userId: interaction.user.id,
			messages: [
				{
					role: "system",
					content:
						"You are Agent Kitten, a helpful AI powered discord bot made by the ClowderTech LLC. You are here to help people with their problems. Your own website is https://agentkitten.com. Also, make sure to walk through the user all the steps you did to get your answer before giving the full answer, especially if you are fixing or creating a users code or doing a math problem. For instance with coding, write out the steps you would take to fix or create the code before giving the code and then adding comments of what youre doing on that line before writing the line of code.",
				},
			],
		};
	} else {
		user_data = chatData[0];
	}

	// Step 4: Push structuredContent into user_data.messages
	const newMessageJson = {
		role: "user",
		content: newMessage,
	};

	user_data.messages.push(newMessageJson);

	const request: ChatRequest = {
		// model: 'mixtral:8x7b',
		// model: 'gpt-4o-mini',
		// model: "mistral-nemo",
		model: "qwen2.5:7b",
		messages: user_data.messages,
		stream: false,
		keep_alive: "15m",
		options: {
			num_ctx: 16383,
			num_predict: 4095,
		},
		tools: [
			{
				type: "function",
				function: {
					name: "eval",
					description:
						"Execute TypeScript code. Use console.log to output data. Make sure to not use infinite loops, do anything illegal, try to retrieve credentials, or access anything about your code.",
					parameters: {
						type: "object",
						properties: {
							code: {
								type: "string",
								description:
									"The code to execute. Make sure to use console.log to output data.",
							},
						},
						required: ["code"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "search",
					description: "Search on Google.",
					parameters: {
						type: "object",
						properties: {
							query: {
								type: "string",
								description: "The search query.",
							},
						},
						required: ["query"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "scrape",
					description: "Scrape a website.",
					parameters: {
						type: "object",
						properties: {
							url: {
								type: "string",
								description:
									"The URL of the website to scrape.",
							},
						},
						required: ["url"],
					},
				},
			},
		],
	};

	const functions = {
		scrape: scrapeWebsite,
		eval: executeEval,
		search: searchGoogle,
	};

	const { full_response, chat_response } = await chatWithFuncs(
		ollama,
		request,
		functions,
	);

	user_data.messages = full_response;

	await setData(client, "textgen", user_data);

	let lastMessage: DiscordMessage | null = null;

	for (const chunk of splitText(chat_response.message.content!, 4000)) {
		if (!lastMessage) {
			lastMessage = await interaction.followUp({
				embeds: [
					new EmbedBuilder()
						.setAuthor({
							name: "Agent Kitten",
							iconURL:
								client.user?.avatarURL() ??
								"https://via.placeholder.com/150x150?color=black",
							url: "https://agentkitten.com/",
						})
						.setTitle("Response")
						.setDescription(chunk)
						.setColor("#2b2d31")
						.setTimestamp(),
				],
			});
		} else {
			lastMessage = await lastMessage.reply({
				embeds: [
					new EmbedBuilder()
						.setAuthor({
							name: "Agent Kitten",
							iconURL:
								client.user?.avatarURL() ??
								"https://via.placeholder.com/150x150?color=black",
							url: "https://agentkitten.com/",
						})
						.setTitle("Response")
						.setDescription(chunk)
						.setColor("#2b2d31")
						.setTimestamp(),
				],
			});
		}
	}
}
