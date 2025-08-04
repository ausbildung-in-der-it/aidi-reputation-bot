import { ChatInputCommandInteraction, MessageFlags } from "discord.js";

export interface SafeReplyOptions {
	content?: string;
	embeds?: any[];
	ephemeral?: boolean;
}

/**
 * Safely defer a reply with fallback handling
 */
export async function safeDeferReply(interaction: ChatInputCommandInteraction, ephemeral = true): Promise<boolean> {
	// Check if already responded to avoid duplicate responses
	if (interaction.replied || interaction.deferred) {
		console.warn("Interaction already responded to, skipping defer");
		return interaction.deferred;
	}

	try {
		await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });
		return true;
	} catch (error) {
		// Check if it's a timeout/expired interaction
		if (error.code === 10062 || error.code === 40060) {
			console.warn("Interaction expired or already acknowledged, skipping defer");
			return false;
		}
		
		console.warn("Failed to defer reply:", error);
		return false;
	}
}

/**
 * Safely respond to an interaction with proper state checking
 */
export async function safeReply(interaction: ChatInputCommandInteraction, options: SafeReplyOptions): Promise<void> {
	try {
		if (interaction.deferred) {
			// Use editReply if deferred
			await interaction.editReply({
				content: options.content,
				embeds: options.embeds,
			});
		} else if (!interaction.replied) {
			// Use reply if not responded yet
			await interaction.reply({
				content: options.content,
				embeds: options.embeds,
				flags: options.ephemeral ? MessageFlags.Ephemeral : undefined,
			});
		} else {
			// Already replied - log and skip to avoid "already acknowledged" error
			console.warn("Interaction already replied to, skipping response");
			return;
		}
	} catch (error) {
		// Check for known interaction errors and skip retry
		if (error.code === 10062 || error.code === 40060) {
			console.warn("Interaction expired or already acknowledged, skipping response");
			return;
		}
		
		console.error("Failed to respond to interaction:", error);
		// No fallback attempts to avoid cascading errors
	}
}