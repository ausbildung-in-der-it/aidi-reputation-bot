import { ChatInputCommandInteraction, MessageFlags } from "discord.js";

export type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;

/**
 * Determines if a command should have ephemeral responses based on command name
 */
function shouldBeEphemeral(interaction: ChatInputCommandInteraction): boolean {
	const ephemeralCommands = [
		"reputation",
		"rate-limits", 
		"award-rp",
		"manage-ranks",
		"set-introduction-channel",
		"notification-channel",
		"leaderboard-exclusions"
	];
	
	// Only leaderboard is public by default
	return interaction.commandName !== "leaderboard";
}

/**
 * Higher-Order Component that wraps command handlers with safe interaction handling
 * - Auto-defers replies to prevent timeouts
 * - Handles interaction state properly  
 * - Provides unified error handling
 */
export function withSafeInteraction(handler: CommandHandler): CommandHandler {
	return async (interaction: ChatInputCommandInteraction) => {
		try {
			// Auto-defer to get 15 minutes instead of 3 seconds
			const ephemeral = shouldBeEphemeral(interaction);
			await interaction.deferReply({ 
				...(ephemeral && { flags: MessageFlags.Ephemeral })
			});
			
			// Execute the actual command handler
			await handler(interaction);
			
		} catch (error) {
			console.error(`Error in ${interaction.commandName} command:`, error);
			
			try {
				// Try to respond with error message
				if (interaction.deferred && !interaction.replied) {
					await interaction.editReply({
						content: "Es ist ein unerwarteter Fehler aufgetreten."
					});
				} else if (!interaction.replied) {
					await interaction.reply({
						content: "Es ist ein unerwarteter Fehler aufgetreten.",
						flags: MessageFlags.Ephemeral
					});
				}
			} catch (responseError) {
				console.error("Failed to send error response:", responseError);
				// Interaction likely expired or was already handled
			}
		}
	};
}

/**
 * Helper for commands that need to send successful responses
 */
export async function safeEditReply(
	interaction: ChatInputCommandInteraction, 
	response: { content?: string; embeds?: any[] }
): Promise<void> {
	if (interaction.deferred && !interaction.replied) {
		await interaction.editReply(response);
	} else if (!interaction.replied) {
		// Fallback for edge cases where defer wasn't called
		await interaction.reply({
			...response,
			flags: shouldBeEphemeral(interaction) ? MessageFlags.Ephemeral : undefined
		});
	} else {
		// Already replied, use followUp
		await interaction.followUp({
			...response,
			flags: MessageFlags.Ephemeral
		});
	}
}

/**
 * Helper for commands that need to send error responses
 */
export async function safeErrorReply(
	interaction: ChatInputCommandInteraction,
	errorMessage: string
): Promise<void> {
	await safeEditReply(interaction, { content: errorMessage });
}