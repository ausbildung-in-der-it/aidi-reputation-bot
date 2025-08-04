import { createRateLimitStatusEmbed } from "@/bot/utils/embeds";
import { rateLimitStatusService } from "@/core/services/rateLimitStatusService";
import { ChatInputCommandInteraction } from "discord.js";

export async function handleRateLimitsCommand(interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		await interaction.reply({
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	const targetUser = interaction.options.getUser("user") || interaction.user;
	const guildId = interaction.guild.id;
	const userId = targetUser.id;

	try {
		const rateLimitStatus = rateLimitStatusService.getUserRateLimitStatus(guildId, userId);
		const embed = createRateLimitStatusEmbed(targetUser, rateLimitStatus);

		await interaction.reply({ embeds: [embed] });
	} catch (error) {
		console.error("Error in rate limits command:", error);
		await interaction.reply({
			content: "Es ist ein Fehler beim Abrufen der Rate Limits aufgetreten.",
			ephemeral: true,
		});
	}
}
