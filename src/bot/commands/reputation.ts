import { createReputationEmbed } from "@/bot/utils/embeds";
import { reputationService } from "@/core/services/reputationService";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";
import { ChatInputCommandInteraction } from "discord.js";

export async function handleReputationCommand(interaction: ChatInputCommandInteraction) {
	await safeDeferReply(interaction, false);

	if (!interaction.guild) {
		await safeReply(interaction, {
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	const targetUser = interaction.options.getUser("user") || interaction.user;
	const guildId = interaction.guild.id;
	const userId = targetUser.id;

	try {
		const reputation = reputationService.getUserReputation(guildId, userId);
		const embed = createReputationEmbed(targetUser, reputation);

		await safeReply(interaction, { embeds: [embed] });
	} catch (error) {
		console.error("Error in reputation command:", error);
		await safeReply(interaction, {
			content: "Es ist ein Fehler beim Abrufen der Reputation aufgetreten.",
			ephemeral: true,
		});
	}
}
