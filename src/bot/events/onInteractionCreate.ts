import { Interaction, MessageFlags } from "discord.js";
import { handleReputationCommand } from "@/bot/commands/reputation";
import { handleLeaderboardCommand } from "@/bot/commands/leaderboard";
import { handleSetIntroductionChannelCommand } from "@/bot/commands/setIntroductionChannel";
import { handleManageRanksCommand } from "@/bot/commands/manageRanks";
import { execute as handleNotificationChannelCommand } from "@/bot/commands/setNotificationChannel";
import { handleRateLimitsCommand } from "@/bot/commands/rateLimits";
import { handleAwardRpCommand } from "@/bot/commands/awardRp";
import { handleLeaderboardExclusionsCommand } from "@/bot/commands/leaderboardExclusions";

export async function onInteractionCreate(interaction: Interaction) {
	if (!interaction.isChatInputCommand()) {
		return;
	}

	try {
		switch (interaction.commandName) {
			case "reputation":
				await handleReputationCommand(interaction);
				break;
			case "leaderboard":
				await handleLeaderboardCommand(interaction);
				break;
			case "set-introduction-channel":
				await handleSetIntroductionChannelCommand(interaction);
				break;
			case "manage-ranks":
				await handleManageRanksCommand(interaction);
				break;
			case "notification-channel":
				await handleNotificationChannelCommand(interaction);
				break;
			case "rate-limits":
				await handleRateLimitsCommand(interaction);
				break;
			case "award-rp":
				await handleAwardRpCommand(interaction);
				break;
			case "leaderboard-exclusions":
				await handleLeaderboardExclusionsCommand(interaction);
				break;
			default:
				console.warn(`Unknown command: ${interaction.commandName}`);
		}
	} catch (error) {
		console.error("Error handling interaction:", error);

		const errorMessage = "Es ist ein unerwarteter Fehler aufgetreten.";

		try {
			if (interaction.deferred) {
				// If deferred, use editReply to update the deferred response
				await interaction.editReply({ content: errorMessage });
			} else if (interaction.replied) {
				// If already replied, use followUp for additional message
				await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
			} else {
				// If not responded yet, use reply
				await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
			}
		} catch (responseError) {
			console.error("Failed to respond to interaction:", responseError);
			// If we can't respond, the interaction has likely expired or been acknowledged elsewhere
		}
	}
}
