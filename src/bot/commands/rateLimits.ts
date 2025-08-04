import { createRateLimitStatusEmbed } from "@/bot/utils/embeds";
import { rateLimitStatusService } from "@/core/services/rateLimitStatusService";
import { ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from "discord.js";

export async function handleRateLimitsCommand(interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		await interaction.reply({
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const requestedUser = interaction.options.getUser("user");
	const guildId = interaction.guild.id;

	// If user wants to see someone else's rate limits, check admin permission
	if (requestedUser && requestedUser.id !== interaction.user.id) {
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: "Du benötigst Administrator-Berechtigung um die Rate Limits anderer User anzuzeigen.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
	}

	const targetUser = requestedUser || interaction.user;
	const userId = targetUser.id;

	try {
		const rateLimitStatus = rateLimitStatusService.getUserRateLimitStatus(guildId, userId);
		const embed = createRateLimitStatusEmbed(targetUser, rateLimitStatus);

		await interaction.reply({ embeds: [embed] });
	} catch (error) {
		console.error("Error in rate limits command:", error);
		await interaction.reply({
			content: "Es ist ein Fehler beim Abrufen der Rate Limits aufgetreten.",
			flags: MessageFlags.Ephemeral,
		});
	}
}
