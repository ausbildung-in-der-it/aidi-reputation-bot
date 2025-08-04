import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { reputationService } from "@/core/services/reputationService";
import { createLeaderboardEmbed } from "@/bot/utils/embeds";
import { leaderboardExclusionService } from "@/core/services/leaderboardExclusionService";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";

export async function handleLeaderboardCommand(interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		await safeReply(interaction, {
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	const requestedLimit = interaction.options.getInteger("limit") || 10;
	const limit = Math.min(requestedLimit, 25); // Cap at 25 users max
	const guildId = interaction.guild.id;
	const guildName = interaction.guild.name;

	// Defer reply since this command might take a while (member fetching)
	const isDeferred = await safeDeferReply(interaction, false);

	try {
		const excludedRoleIds = leaderboardExclusionService.getExcludedRoleIds(guildId);
		let leaderboard = reputationService.getGuildLeaderboard(guildId, limit * 2);

		if (excludedRoleIds.length > 0) {
			const filteredLeaderboard = [];
			
			for (const entry of leaderboard) {
				try {
					const member = await interaction.guild.members.fetch(entry.to_user_id);
					const hasExcludedRole = member.roles.cache.some(role => excludedRoleIds.includes(role.id));
					
					if (!hasExcludedRole) {
						filteredLeaderboard.push(entry);
					}
					
					if (filteredLeaderboard.length >= limit) {
						break;
					}
				} catch {
					filteredLeaderboard.push(entry);
					if (filteredLeaderboard.length >= limit) {
						break;
					}
				}
			}
			
			leaderboard = filteredLeaderboard;
		} else {
			leaderboard = leaderboard.slice(0, limit);
		}

		const embed = createLeaderboardEmbed(leaderboard, guildName);
		await safeReply(interaction, { embeds: [embed] });
	} catch (error) {
		console.error("Error in leaderboard command:", error);
		await safeReply(interaction, {
			content: "Es ist ein Fehler beim Abrufen des Leaderboards aufgetreten.",
			ephemeral: true,
		});
	}
}
