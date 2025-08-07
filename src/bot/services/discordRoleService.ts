import { Guild, PermissionFlagsBits } from "discord.js";
import { roleManagementService } from "@/core/services/roleManagementService";
import { reputationService } from "@/core/services/reputationService";
import { logger } from "@/core/services/loggingService";

export interface RoleUpdateResult {
	success: boolean;
	updated: boolean;
	previousRole?: string;
	newRole?: string;
	error?: string;
	errorType?: "permission" | "hierarchy" | "not_found" | "unknown";
}

export const discordRoleService = {
	/**
	 * Update a user's reputation rank role in Discord
	 */
	updateUserRank: async (guild: Guild, userId: string, currentRp: number): Promise<RoleUpdateResult> => {
		try {
			// Check if bot has ManageRoles permission
			const botMember = guild.members.me;
			if (!botMember) {
				logger.error("Bot member not found in guild", { guildId: guild.id });
				return {
					success: false,
					updated: false,
					error: "Bot member not found in guild",
					errorType: "not_found",
				};
			}

			if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
				logger.error("Bot lacks ManageRoles permission", { guildId: guild.id });
				return {
					success: false,
					updated: false,
					error: "Bot lacks ManageRoles permission",
					errorType: "permission",
				};
			}

			// Get the member
			const member = await guild.members.fetch(userId).catch(() => null);
			if (!member) {
				logger.debug("Member not found in guild", { guildId: guild.id, userId });
				return {
					success: false,
					updated: false,
					error: "Member not found in guild",
					errorType: "not_found",
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
				logger.debug("User already has correct role", { 
					guildId: guild.id, 
					userId, 
					roleId: currentRankRole.id 
				});
				return {
					success: true,
					updated: false,
					previousRole: currentRankRole.name,
					newRole: currentRankRole.name,
				};
			}

			// If user should have no role and currently has no reputation role, no update needed
			if (!shouldHaveRole && !currentlyHasRole) {
				logger.debug("User has no role and needs no role", { guildId: guild.id, userId });
				return {
					success: true,
					updated: false,
					previousRole: undefined,
					newRole: undefined,
				};
			}

			// Remove current reputation role if exists
			if (currentRankRole) {
				// Check if bot can manage this role
				if (!discordRoleService.canBotManageRole(guild, currentRankRole.id)) {
					logger.error("Bot cannot manage role (hierarchy issue)", { 
						guildId: guild.id, 
						userId, 
						roleId: currentRankRole.id,
						details: { roleName: currentRankRole.name }
					});
					return {
						success: false,
						updated: false,
						error: `Bot cannot manage role '${currentRankRole.name}' - check role hierarchy`,
						errorType: "hierarchy",
					};
				}
				await member.roles.remove(currentRankRole.id, "Reputation rank update");
				logger.info("Removed role from user", { 
					guildId: guild.id, 
					userId, 
					roleId: currentRankRole.id,
					details: { roleName: currentRankRole.name }
				});
			}

			// Add new reputation role if user qualifies for one
			if (newRank) {
				const newRole = guild.roles.cache.get(newRank.roleId);
				if (!newRole) {
					logger.error("Role not found in guild", { 
						guildId: guild.id, 
						roleId: newRank.roleId 
					});
					return {
						success: false,
						updated: false,
						error: `Role ${newRank.roleId} not found in guild`,
						errorType: "not_found",
					};
				}
				
				// Check if bot can manage this role
				if (!discordRoleService.canBotManageRole(guild, newRole.id)) {
					logger.error("Bot cannot manage role (hierarchy issue)", { 
						guildId: guild.id, 
						userId, 
						roleId: newRole.id,
						details: { roleName: newRole.name }
					});
					return {
						success: false,
						updated: false,
						error: `Bot cannot manage role '${newRole.name}' - check role hierarchy`,
						errorType: "hierarchy",
					};
				}
				
				await member.roles.add(newRole.id, "Reputation rank promotion");
				logger.info("Added role to user", { 
					guildId: guild.id, 
					userId, 
					roleId: newRole.id,
					details: { roleName: newRole.name, rp: currentRp }
				});
			}

			logger.roleOperation(
				"sync",
				true,
				{
					guildId: guild.id,
					userId,
					roleId: newRank?.roleId,
					roleName: newRank ? guild.roles.cache.get(newRank.roleId)?.name : undefined,
					reason: `RP: ${currentRp}`,
				}
			);

			return {
				success: true,
				updated: true,
				previousRole: currentRankRole?.name,
				newRole: newRank ? guild.roles.cache.get(newRank.roleId)?.name : undefined,
			};
		} catch (error) {
			logger.error("Error updating user rank", { 
				guildId: guild.id, 
				userId, 
				error 
			});
			return {
				success: false,
				updated: false,
				error: error instanceof Error ? error.message : "Unknown error",
				errorType: "unknown",
			};
		}
	},

	/**
	 * Sync all users' ranks in a guild (useful for initial setup or fixing desync)
	 */
	syncAllUserRanks: async (guild: Guild): Promise<{ success: number; failed: number; errors: Map<string, string> }> => {
		let success = 0;
		let failed = 0;
		const errors = new Map<string, string>();

		try {
			logger.info("Starting rank sync", { guildId: guild.id });

			// Check bot permissions first
			const botMember = guild.members.me;
			if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
				logger.error("Bot lacks ManageRoles permission for sync", { guildId: guild.id });
				errors.set("permission", "Bot lacks ManageRoles permission");
				return { success: 0, failed: 0, errors };
			}

			// Get all users with RP in this guild
			const usersWithRP = reputationService.getAllUsersWithRP(guild.id);
			logger.info(`Found users with RP to sync`, { 
				guildId: guild.id, 
				details: { count: usersWithRP.length } 
			});

			// Update each user's rank
			for (const userRp of usersWithRP) {
				try {
					const result = await discordRoleService.updateUserRank(guild, userRp.userId, userRp.totalRp);

					if (result.success) {
						success++;
						if (result.updated) {
							logger.info(
								`Updated rank for user`,
								{ 
									guildId: guild.id,
									userId: userRp.userId,
									details: {
										previousRole: result.previousRole || "None",
										newRole: result.newRole || "None",
										rp: userRp.totalRp
									}
								}
							);
						}
					} else {
						failed++;
						if (result.errorType) {
							const errorKey = `${result.errorType}_${userRp.userId}`;
							errors.set(errorKey, result.error || "Unknown error");
						}
						logger.warn(`Failed to update rank for user`, {
							guildId: guild.id,
							userId: userRp.userId,
							details: { 
								error: result.error,
								errorType: result.errorType 
							}
						});
					}
				} catch (userError) {
					failed++;
					errors.set(`unknown_${userRp.userId}`, "Unexpected error");
					logger.error(`Error updating rank for user`, {
						guildId: guild.id,
						userId: userRp.userId,
						error: userError
					});
				}
			}

			logger.info(`Rank sync completed`, { 
				guildId: guild.id, 
				details: { success, failed } 
			});
		} catch (error) {
			logger.error("Error syncing user ranks", { guildId: guild.id, error });
		}

		return { success, failed, errors };
	},

	/**
	 * Check if bot can manage a specific role (hierarchy check)
	 */
	canBotManageRole: (guild: Guild, roleId: string): boolean => {
		const botMember = guild.members.me;
		if (!botMember) {return false;}

		const role = guild.roles.cache.get(roleId);
		if (!role) {return false;}

		// Bot's highest role position
		const botHighestRole = botMember.roles.highest;
		
		// Bot can only manage roles below its highest role
		return botHighestRole.position > role.position;
	},

	/**
	 * Validate that all configured rank roles exist in the guild and can be managed
	 */
	validateRankRoles: (guild: Guild): { 
		valid: string[]; 
		invalid: string[]; 
		unmanageable: string[];
		details: Map<string, string>;
	} => {
		const ranks = roleManagementService.getRanksForGuild(guild.id);
		const valid: string[] = [];
		const invalid: string[] = [];
		const unmanageable: string[] = [];
		const details = new Map<string, string>();

		for (const rank of ranks) {
			const role = guild.roles.cache.get(rank.roleId);
			if (!role) {
				invalid.push(rank.rankName);
				details.set(rank.rankName, "Role not found in guild");
			} else if (!discordRoleService.canBotManageRole(guild, rank.roleId)) {
				unmanageable.push(rank.rankName);
				details.set(rank.rankName, `Role '${role.name}' is above bot's highest role in hierarchy`);
			} else {
				valid.push(rank.rankName);
			}
		}

		return { valid, invalid, unmanageable, details };
	},
};
