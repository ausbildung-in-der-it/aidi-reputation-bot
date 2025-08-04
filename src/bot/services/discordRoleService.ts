import { Guild } from "discord.js";
import { roleManagementService } from "@/core/services/roleManagementService";
import { reputationService } from "@/core/services/reputationService";

export interface RoleUpdateResult {
	success: boolean;
	updated: boolean;
	previousRole?: string;
	newRole?: string;
	error?: string;
}

export const discordRoleService = {
	/**
	 * Update a user's reputation rank role in Discord
	 */
	updateUserRank: async (guild: Guild, userId: string, currentRp: number): Promise<RoleUpdateResult> => {
		try {
			// Get the member
			const member = await guild.members.fetch(userId).catch(() => null);
			if (!member) {
				return {
					success: false,
					updated: false,
					error: "Member not found in guild",
				};
			}

			// Get current eligible rank
			const newRank = roleManagementService.getUserEligibleRank(guild.id, currentRp);

			// Get all reputation ranks for this guild to find current role
			const allRanks = roleManagementService.getRanksForGuild(guild.id);
			const currentReputationRoles = allRanks.map(rank => rank.roleId);

			// Find which reputation role the user currently has
			const currentRankRole = member.roles.cache.find(role => currentReputationRoles.includes(role.id));

			// Check if any update is needed
			const shouldHaveRole = newRank !== null;
			const currentlyHasRole = currentRankRole !== undefined;

			// If user should have a specific role and already has that exact role, no update needed
			if (shouldHaveRole && currentlyHasRole && newRank.roleId === currentRankRole.id) {
				return {
					success: true,
					updated: false,
					previousRole: currentRankRole.name,
					newRole: currentRankRole.name,
				};
			}

			// If user should have no role and currently has no reputation role, no update needed
			if (!shouldHaveRole && !currentlyHasRole) {
				return {
					success: true,
					updated: false,
					previousRole: undefined,
					newRole: undefined,
				};
			}

			// Remove current reputation role if exists
			if (currentRankRole) {
				await member.roles.remove(currentRankRole.id, "Reputation rank update");
			}

			// Add new reputation role if user qualifies for one
			if (newRank) {
				const newRole = guild.roles.cache.get(newRank.roleId);
				if (newRole) {
					await member.roles.add(newRole.id, "Reputation rank promotion");
				} else {
					return {
						success: false,
						updated: false,
						error: `Role ${newRank.roleId} not found in guild`,
					};
				}
			}

			return {
				success: true,
				updated: true,
				previousRole: currentRankRole?.name,
				newRole: newRank ? guild.roles.cache.get(newRank.roleId)?.name : undefined,
			};
		} catch (error) {
			console.error("Error updating user rank:", error);
			return {
				success: false,
				updated: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	},

	/**
	 * Sync all users' ranks in a guild (useful for initial setup or fixing desync)
	 */
	syncAllUserRanks: async (guild: Guild): Promise<{ success: number; failed: number }> => {
		let success = 0;
		let failed = 0;

		try {
			console.log(`Starting rank sync for guild ${guild.id}...`);

			// Get all users with RP in this guild
			const usersWithRP = reputationService.getAllUsersWithRP(guild.id);
			console.log(`Found ${usersWithRP.length} users with RP to sync`);

			// Update each user's rank
			for (const userRp of usersWithRP) {
				try {
					const result = await discordRoleService.updateUserRank(guild, userRp.userId, userRp.totalRp);

					if (result.success) {
						success++;
						if (result.updated) {
							console.log(
								`Updated rank for user ${userRp.userId}: ${result.previousRole || "None"} → ${result.newRole || "None"} (${userRp.totalRp} RP)`
							);
						}
					} else {
						failed++;
						console.warn(`Failed to update rank for user ${userRp.userId}: ${result.error}`);
					}
				} catch (userError) {
					failed++;
					console.error(`Error updating rank for user ${userRp.userId}:`, userError);
				}
			}

			console.log(`Rank sync completed: ${success} success, ${failed} failed`);
		} catch (error) {
			console.error("Error syncing user ranks:", error);
		}

		return { success, failed };
	},

	/**
	 * Validate that all configured rank roles exist in the guild
	 */
	validateRankRoles: (guild: Guild): { valid: string[]; invalid: string[] } => {
		const ranks = roleManagementService.getRanksForGuild(guild.id);
		const valid: string[] = [];
		const invalid: string[] = [];

		for (const rank of ranks) {
			const role = guild.roles.cache.get(rank.roleId);
			if (role) {
				valid.push(rank.rankName);
			} else {
				invalid.push(rank.rankName);
			}
		}

		return { valid, invalid };
	},
};
