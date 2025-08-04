import { createReputationEmbed } from "@/bot/utils/embeds";
import { reputationService } from "@/core/services/reputationService";
import { ChatInputCommandInteraction, MessageFlags } from "discord.js";

export async function handleReputationCommand(interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		await interaction.reply({
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const targetUser = interaction.options.getUser("user") || interaction.user;
	const guildId = interaction.guild.id;
	const userId = targetUser.id;

	try {
		const reputation = reputationService.getUserReputation(guildId, userId);
		const embed = createReputationEmbed(targetUser, reputation);

		await interaction.reply({ embeds: [embed] });
	} catch (error) {
		console.error("Error in reputation command:", error);
		await interaction.reply({
			content: "Es ist ein Fehler beim Abrufen der Reputation aufgetreten.",
			flags: MessageFlags.Ephemeral,
		});
	}
}
