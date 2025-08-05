import { createReputationEventsEmbed } from "@/bot/utils/embeds";
import { reputationService } from "@/core/services/reputationService";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";
import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";

export async function handleReputationEventsCommand(interaction: ChatInputCommandInteraction) {
	await safeDeferReply(interaction, true);
	
	if (!interaction.guild) {
		await safeReply(interaction, {
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	// Check if user has administrator permissions
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		await safeReply(interaction, {
			content: "Du benötigst Administrator-Berechtigung um Reputation Events anzuzeigen.",
			ephemeral: true,
		});
		return;
	}

	const targetUser = interaction.options.getUser("user", true);
	const limit = Math.min(interaction.options.getInteger("limit") || 20, 100);
	const type = (interaction.options.getString("type") as 'received' | 'given' | 'all') || 'all';
	const guildId = interaction.guild.id;

	// Validate that target is not a bot
	if (targetUser.bot) {
		await safeReply(interaction, {
			content: "Reputation Events können nicht für Bots angezeigt werden.",
			ephemeral: true,
		});
		return;
	}

	try {
		const events = reputationService.getUserReputationEvents(guildId, targetUser.id, limit, type);
		const embed = createReputationEventsEmbed(targetUser, events, type);

		await safeReply(interaction, { embeds: [embed] });
	} catch (error) {
		console.error("Error in reputation-events command:", error);
		await safeReply(interaction, {
			content: "Es ist ein Fehler beim Abrufen der Reputation Events aufgetreten.",
			ephemeral: true,
		});
	}
}