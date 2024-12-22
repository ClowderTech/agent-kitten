import {
	ApplicationCommandOptionType,
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	InteractionContextType,
	SlashCommandBuilder,
	SlashCommandStringOption,
} from "discord.js";
import type { ClientExtended } from "../../../utils/classes.ts";
import { Document, WithId } from "mongodb";
import { launch } from "puppeteer";
import {
	chatWithFuncs,
	convertBlobToUint8Array,
} from "../../../utils/textgen.ts";
import { ChatRequest } from "ollama";
import { getData, setData } from "../../../utils/mongohelper.ts";
import { deadline } from "@std/async";

export const data = new SlashCommandBuilder()
	.setName("chat")
	.setDescription("Chat with Agent Kitten.")
	.setIntegrationTypes([
		ApplicationIntegrationType.UserInstall,
		ApplicationIntegrationType.GuildInstall,
	])
	.setContexts([
		InteractionContextType.BotDM,
		InteractionContextType.Guild,
		InteractionContextType.PrivateChannel,
	])
	.addStringOption((option: SlashCommandStringOption) =>
		option
			.setName("message")
			.setDescription("The message to send to Agent Kitten.")
			.setRequired(true)
	)
	.addAttachmentOption((option) =>
		option
			.setName("attachment1")
			.setDescription("An attachment to send to Agent Kitten.")
			.setRequired(false)
	)
	.addAttachmentOption((option) =>
		option
			.setName("attachment2")
			.setDescription("An attachment to send to Agent Kitten.")
			.setRequired(false)
	)
	.addAttachmentOption((option) =>
		option
			.setName("attachment3")
			.setDescription("An attachment to send to Agent Kitten.")
			.setRequired(false)
	)
	.addAttachmentOption((option) =>
		option
			.setName("attachment4")
			.setDescription("An attachment to send to Agent Kitten.")
			.setRequired(false)
	)
	.addAttachmentOption((option) =>
		option
			.setName("attachment5")
			.setDescription("An attachment to send to Agent Kitten.")
			.setRequired(false)
	);

function splitText(text: string, maxLength: number = 2000): string[] {
	const lines = text.split(/\r?\n/);
	const chunks: string[] = [];
	let currentChunk = "";
	let codeBlockOpen = false;

	const pushChunk = () => {
		if (codeBlockOpen) {
			currentChunk += "```\n";
			chunks.push(currentChunk.trim());
			currentChunk = "```\n";
		} else {
			chunks.push(currentChunk.trim());
			currentChunk = "";
		}
	};

	for (const line of lines) {
		if (line.trim().startsWith("```")) {
			codeBlockOpen = !codeBlockOpen;
		}

		if (currentChunk.length + line.length + 1 > maxLength) {
			if (line.length + 1 > maxLength) {
				let remainingLine = line;
				while (remainingLine.length > 0) {
					const spaceLeft = maxLength - currentChunk.length - 1;
					const segment = remainingLine.slice(0, spaceLeft);
					currentChunk += segment;
					remainingLine = remainingLine.slice(spaceLeft);
					if (remainingLine.length > 0) {
						pushChunk();
					}
				}
				currentChunk += "\n";
			} else {
				pushChunk();
				currentChunk += line + "\n";
			}
		} else {
			currentChunk += line + "\n";
		}
	}

	if (currentChunk.trim()) {
		if (codeBlockOpen) {
			currentChunk += "```";
		}
		chunks.push(currentChunk.trim());
	}

	return chunks;
}

async function executeEval(code: string): Promise<string> {
	const evalTempFile = `${Deno.cwd()}/evalTempFile.ts`;

	// Write the code to a temporary file
	await Deno.writeTextFile(evalTempFile, code);

	const command = new Deno.Command(Deno.execPath(), {
		args: [
			"run",
			"--quiet",
			evalTempFile,
		],
		stdout: "piped",
		stderr: "piped",
	});

	const child = command.spawn();

	try {
		// Attempt to get the output with a timeout
		const { stdout, stderr } = await deadline(child.output(), 3000);

		// Decode the output
		const output = new TextDecoder().decode(stdout);
		const errorOutput = new TextDecoder().decode(stderr);

		// Return error output if present, otherwise return standard output
		return errorOutput ? errorOutput.normalize().trim() : output.normalize().trim();
	} catch (error) {
		if (error instanceof DOMException) {
			// Kill the subprocess if a timeout occurs
			child.kill("SIGTERM");
			return "Execution timed out. Scripts may run for only 3 seconds or longer.";
		} else if (error instanceof Error) {
			return `${error.name}: ${error.message}`;
		} else {
			return "An unknown error occurred";
		}
	} finally {
		// Clean up by removing the temporary file
		await Deno.remove(evalTempFile);
	}
}

async function searchGoogle(query: string): Promise<string> {
	const searchResultsAmount = 3;
	const escapedTerm = encodeURIComponent(query);
	const url =
		`https://searx.clowdertech.com/search?q=${escapedTerm}&language=auto&time_range=&safesearch=0&categories=general&format=json`;

	let searchResults = "";
	let start = 0;

	const browser = await launch({ headless: true, args: ["--no-sandbox"] });
	const page = await browser.newPage();

	try {
		const response = await page.goto(url, {
			timeout: 10000,
			waitUntil: "load",
		});
		if (!response?.ok()) {
			return `Response not ok. Status ${response?.status()}.`;
		}
		const data = await response.json();
		const results = data.results;
		for (const result of results) {
			searchResults += `[${
				start + 1
			}] ${result.url} || ${result.content}\n`;
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

async function scrapeWebsite(url: string): Promise<string> {
	const browser = await launch({
		headless: true,
		args: ["--no-sandbox"],
	});

	const page = await browser.newPage();

	try {
		const response = await page.goto(url, {
			timeout: 30000,
			waitUntil: "load",
		});

		if (!response?.ok()) {
			return `Response not ok. Status ${response?.status()}.`;
		}

		await page.waitForSelector("body");

		const visibleTextWithLinks = await page.evaluate(() => {
			// Function to determine if an element is visible
			function isVisible(element: HTMLElement): boolean {
				const style = globalThis.getComputedStyle(element);
				return (
					style.display !== "none" &&
					style.visibility !== "hidden" &&
					style.opacity !== "0" &&
					element.offsetWidth > 0 &&
					element.offsetHeight > 0
				);
			}

			// Remove non-visible elements that might interfere with text extraction
			const elementsToRemove = document.querySelectorAll(
				"script, style, header, footer, nav, .ad, .popup, .hidden",
			);
			elementsToRemove.forEach((el) => el.remove());

			// Traverse the document and collect visible text and links
			const walker = document.createTreeWalker(
				document.body,
				NodeFilter.SHOW_TEXT,
				null,
			);
			let node: Text | null;
			const textWithLinks: string[] = [];

			while ((node = walker.nextNode() as Text | null)) {
				const parentElement = node.parentElement;
				if (parentElement && isVisible(parentElement)) {
					const textContent = node.textContent?.trim();
					if (textContent) {
						if (parentElement.tagName.toLowerCase() === "a") {
							const href = (parentElement as HTMLAnchorElement)
								.href;
							textWithLinks.push(`[${textContent}](${href})`);
						} else {
							textWithLinks.push(textContent);
						}
					}
				}
			}

			return textWithLinks.join("\n");
		});

		return visibleTextWithLinks;
	} catch (error) {
		console.error("Error scraping website:", error);
		return "Error occurred during scraping.";
	} finally {
		await browser.close();
	}
}

export async function execute(interaction: ChatInputCommandInteraction) {
	const client = interaction.client as ClientExtended;

	const ollama = client.ollama;

	await interaction.deferReply();

	const message = interaction.options.getString("message", true); // Get the message content

	const attachments = interaction.options.data
		.filter(
			(option) => option.type === ApplicationCommandOptionType.Attachment,
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
				attachmentContents.push(text.normalize().trim()); // Add the text content to the array
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
							content:
								"Describe this image or video in as much detail as you possibly can.",
							images: [image],
						},
					],
				});

				attachmentURLs.push(
					chat_response.message.content.normalize().trim(),
				);
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
						"You are Agent Kitten, a helpful AI powered discord bot made by the ClowderTech LLC. You are here to help people with their problems. Your own website is https://agentkitten.com/.",
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

	for (const chunk of splitText(chat_response.message.content!, 2000)) {
		await interaction.followUp({
			content: chunk,
			allowedMentions: { parse: [] },
		});
	}
}
