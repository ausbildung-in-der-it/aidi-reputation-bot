import { Interaction } from "discord.js";
import { handleReputationCommand } from "@/bot/commands/reputation";
import { handleLeaderboardCommand } from "@/bot/commands/leaderboard";
import { handleSetIntroductionChannelCommand } from "@/bot/commands/setIntroductionChannel";
import { handleManageRanksCommand } from "@/bot/commands/manageRanks";
import { execute as handleNotificationChannelCommand } from "@/bot/commands/setNotificationChannel";
import { handleRateLimitsCommand } from "@/bot/commands/rateLimits";
import { handleAwardRpCommand } from "@/bot/commands/awardRp";
import { handleLeaderboardExclusionsCommand } from "@/bot/commands/leaderboardExclusions";
import { handleReputationEventsCommand } from "@/bot/commands/reputationEvents";
import { safeReply } from "@/bot/utils/safeReply";

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
			case "reputation-events":
				await handleReputationEventsCommand(interaction);
				break;
			default:
				console.warn(`Unknown command: ${interaction.commandName}`);
		}
	} catch (error) {
		console.error("Error handling interaction:", error);

		// Check if error is related to interaction timeout/expiration
		const isTimeoutError = (error as any)?.code === 10062 || (error as any)?.message?.includes("Unknown interaction");
		const isAlreadyAcknowledged = (error as any)?.code === 40060 || (error as any)?.message?.includes("already been acknowledged");
		
		if (isTimeoutError || isAlreadyAcknowledged) {
			console.warn("Interaction timeout or already acknowledged, skipping error response");
			return; // Don't try to respond to expired/acknowledged interactions
		}

		const errorMessage = "Es ist ein unerwarteter Fehler aufgetreten.";

		// Only try to respond if the interaction seems fresh and we haven't already responded
		try {
			// Use our safe reply utility which handles all the state checking
			await safeReply(interaction, {
				content: errorMessage,
				ephemeral: true,
			});
		} catch (responseError) {
			console.error("Failed to respond to interaction:", responseError);
			// If we can't respond, the interaction has likely expired or been acknowledged elsewhere
		}
	}
}
