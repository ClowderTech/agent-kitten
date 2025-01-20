import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	SlashCommandStringOption,
} from "discord.js";
import type { ClientExtended } from "../utils/classes.ts";

export const data = new SlashCommandBuilder()
	.setName("calculatevram")
	.setDescription(
		"Calculates the amount of VRAM you will need for a given Ollama model."
	)
	.addStringOption((option: SlashCommandStringOption) =>
		option
			.setName("model")
			.setDescription("Send the model name on Ollama to find.")
			.setRequired(true)
	);

interface ModelInfo {
	[key: string]: string | number | boolean | null;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
}

export async function execute(
	interaction: ChatInputCommandInteraction
): Promise<void> {
	const model = interaction.options.getString("model", true);

	const client = interaction.client as ClientExtended;

	// Fetch the model details from the API
	const response = await client.ollama.show({ model: model });

	const model_info = response.model_info as unknown as ModelInfo;

	// Extract the necessary fields for VRAM calculation
	const architecture = model_info["general.architecture"]!;
	const blockCount = Number(model_info[`${architecture}.block_count`]!);
	const embeddingLength = Number(
		model_info[`${architecture}.embedding_length`]!
	);
	const headCount = Number(
		model_info[`${architecture}.attention.head_count`]!
	);
	const headCountKV = Number(
		model_info[`${architecture}.attention.head_count_kv`]!
	);
	const contextLength = Number(model_info[`${architecture}.context_length`]!);

	// Extract the quantization level from "details"
	const quantizationLevel = response.details?.quantization_level;
	if (!quantizationLevel) {
		await interaction.reply(
			"Error: Quantization level is missing from the response."
		);
		return;
	}

	// Parse the first number in quantization_level
	const bytesPerValue = parseInt(
		(quantizationLevel.match(/\d+/) || ["4"])[0]
	);

	if (!bytesPerValue || isNaN(bytesPerValue)) {
		await interaction.reply(
			"Error: Unable to extract a valid quantization level from the response."
		);
		return;
	}

	// Calculate VRAM
	const vram =
		(bytesPerValue / 8) *
		2 * // K and V values
		blockCount *
		embeddingLength *
		headCountKV *
		(contextLength / headCount);

	// Reply with the calculated VRAM
	await interaction.reply(
		`The VRAM required is approximately ${formatBytes(vram)}`
	);
}
