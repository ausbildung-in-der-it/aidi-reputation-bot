import { createRateLimitStatusEmbed } from "@/bot/utils/embeds";
import { rateLimitStatusService } from "@/core/services/rateLimitStatusService";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";
import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";

export async function handleRateLimitsCommand(interaction: ChatInputCommandInteraction) {
	await safeDeferReply(interaction, true);
	
	if (!interaction.guild) {
		await safeReply(interaction, {
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	const requestedUser = interaction.options.getUser("user");
	const guildId = interaction.guild.id;

	// If user wants to see someone else's rate limits, check admin permission
	if (requestedUser && requestedUser.id !== interaction.user.id) {
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
			await safeReply(interaction, {
				content: "Du benötigst Administrator-Berechtigung um die Rate Limits anderer User anzuzeigen.",
				ephemeral: true,
			});
			return;
		}
	}

	const targetUser = requestedUser || interaction.user;
	const userId = targetUser.id;

	try {
		const rateLimitStatus = rateLimitStatusService.getUserRateLimitStatus(guildId, userId);
		const embed = createRateLimitStatusEmbed(targetUser, rateLimitStatus);

		await safeReply(interaction, { embeds: [embed] });
	} catch (error) {
		console.error("Error in rate limits command:", error);
		await safeReply(interaction, {
			content: "Es ist ein Fehler beim Abrufen der Rate Limits aufgetreten.",
			ephemeral: true,
		});
	}
}
