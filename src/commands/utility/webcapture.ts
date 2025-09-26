import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	InteractionContextType,
	SlashCommandBuilder,
	SlashCommandStringOption,
} from "discord.js";
import { connect } from "puppeteer";
import crypto from "crypto";
import * as path from "path";
import * as os from "os";
import fs from "fs/promises";

export const data = new SlashCommandBuilder()
	.setName("webcapture")
	.setDescription("Take a screenshot of a website (useful if the website's contents is unknown)")
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
			.setName("url")
			.setDescription("The website URL to take a screenshot of.")
			.setRequired(true)
	);

async function screenshotWebsite(url: string): Promise<string> {
	const browser = await connect({
		browserWSEndpoint: process.env.BROWSER_WS_URL!,
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

		const screenshotPath = path.join(os.tmpdir(), crypto.randomUUID())

		await page.screenshot({ path: `${screenshotPath}.webp` });

		return `${screenshotPath}.webp`;
	} catch (error) {
		console.error("Error scraping website:", error);
		return "Error occurred during scraping.";
	} finally {
		await browser.close();
	}
}

async function cleanup(dir: string) {
	try {
		// Node >=14.14 supports rm; use recursive true to remove file and dir
		await fs.rm(dir, { recursive: true, force: true });
	} catch (err) {
		// best effort cleanup; log but don't throw
		console.error("Failed to remove temp dir:", err);
	}
}

export async function execute(interaction: ChatInputCommandInteraction) {
	const url = interaction.options.getString("url", true);

	interaction.deferReply();

	const screenshotPath = await screenshotWebsite(url);

	await interaction.followUp({ content: `Here is a screenshot of the url \`${url}\``, files: [screenshotPath] });

	await cleanup(screenshotPath);
}
