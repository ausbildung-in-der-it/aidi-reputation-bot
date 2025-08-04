import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { roleManagementService } from "@/core/services/roleManagementService";
import { reputationService } from "@/core/services/reputationService";
import { discordRoleService } from "@/bot/services/discordRoleService";
import { db } from "@/db/sqlite";
import { generateGuildId, generateMessageId } from "../setup/testUtils";

// Mock Discord Collection-like behavior
const createMockCollection = (entries: [string, any][] = []) => {
	const map = new Map(entries);
	
	const mockCollection = {
		find: vi.fn().mockImplementation((predicate: (value: any, key: string) => boolean) => {
			for (const [key, value] of map.entries()) {
				if (predicate(value, key)) {
					return value;
				}
			}
			return undefined;
		}),
		get: vi.fn().mockImplementation((key: string) => {
			return map.get(key);
		}),
		set: (key: string, value: any) => map.set(key, value),
		has: (key: string) => map.has(key),
		delete: (key: string) => map.delete(key),
		clear: () => map.clear(),
		get size() { return map.size; },
		entries: () => map.entries(),
		keys: () => map.keys(),
		values: () => map.values(),
	};
	
	return mockCollection;
};

// Mock Discord Guild and Role objects for testing
const createMockGuild = (guildId: string, customRoles: [string, any][] = []) => {
	// Cache for member objects to ensure consistency
	const memberCache = new Map();
	
	// Default roles plus any custom roles
	const defaultRoles: [string, any][] = [
		["role_neuling", { id: "role_neuling", name: "Neuling" }],
		["role_guide", { id: "role_guide", name: "Guide" }],
		["role_expert", { id: "role_expert", name: "Expert" }],
		["role_master", { id: "role_master", name: "Master" }],
		["role_novice", { id: "role_novice", name: "Novice" }],
		["role_starter", { id: "role_starter", name: "Starter" }],
	];
	
	const allRoles = [...defaultRoles, ...customRoles];
	
	const guild = {
		id: guildId,
		roles: {
			cache: createMockCollection(allRoles),
		},
		members: {
			fetch: vi.fn().mockImplementation((userId: string) => {
				// Return cached member if exists, otherwise create new one
				if (!memberCache.has(userId)) {
					memberCache.set(userId, {
						id: userId,
						roles: {
							cache: createMockCollection(),
							add: vi.fn().mockResolvedValue(undefined),
							remove: vi.fn().mockResolvedValue(undefined),
						},
					});
				}
				return Promise.resolve(memberCache.get(userId));
			}),
		},
	};
	
	return guild;
};

const createMockMember = (userId: string, currentRoles: string[] = []) => {
	const roleEntries: [string, any][] = currentRoles.map(roleId => [
		roleId, 
		{ id: roleId, name: `Role_${roleId}` }
	]);

	return {
		id: userId,
		roles: {
			cache: createMockCollection(roleEntries),
			add: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
		},
	};
};

describe("Reputation Rank System", () => {
	let guildId: string;
	let guild2Id: string;

	beforeEach(async () => {
		// Clean up test database for each test
		db.exec("DELETE FROM reputation_events");
		db.exec("DELETE FROM reputation_rate_limits");
		db.exec("DELETE FROM daily_bonus_tracking");
		db.exec("DELETE FROM introduction_channel_config");
		db.exec("DELETE FROM introduction_reply_tracking");
		db.exec("DELETE FROM reputation_ranks");

		guildId = generateGuildId();
		guild2Id = generateGuildId();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Role Management Service", () => {
		it("should add and retrieve ranks for guild", () => {
			// Add ranks
			const success1 = roleManagementService.addRank(guildId, "Neuling", 25, "role_neuling");
			const success2 = roleManagementService.addRank(guildId, "Guide", 50, "role_guide");
			const success3 = roleManagementService.addRank(guildId, "Expert", 100, "role_expert");

			expect(success1).toBe(true);
			expect(success2).toBe(true);
			expect(success3).toBe(true);

			// Retrieve ranks
			const ranks = roleManagementService.getRanksForGuild(guildId);
			expect(ranks).toHaveLength(3);
			expect(ranks[0].rankName).toBe("Neuling");
			expect(ranks[0].requiredRp).toBe(25);
			expect(ranks[1].rankName).toBe("Guide");
			expect(ranks[1].requiredRp).toBe(50);
			expect(ranks[2].rankName).toBe("Expert");
			expect(ranks[2].requiredRp).toBe(100);
		});

		it("should find highest eligible rank for user RP", () => {
			// Setup ranks
			roleManagementService.addRank(guildId, "Neuling", 25, "role_neuling");
			roleManagementService.addRank(guildId, "Guide", 50, "role_guide");
			roleManagementService.addRank(guildId, "Expert", 100, "role_expert");

			// Test different RP levels
			expect(roleManagementService.getUserEligibleRank(guildId, 0)).toBeNull();
			expect(roleManagementService.getUserEligibleRank(guildId, 24)).toBeNull();
			
			const rank25 = roleManagementService.getUserEligibleRank(guildId, 25);
			expect(rank25?.rankName).toBe("Neuling");
			
			const rank49 = roleManagementService.getUserEligibleRank(guildId, 49);
			expect(rank49?.rankName).toBe("Neuling");
			
			const rank50 = roleManagementService.getUserEligibleRank(guildId, 50);
			expect(rank50?.rankName).toBe("Guide");
			
			const rank100 = roleManagementService.getUserEligibleRank(guildId, 100);
			expect(rank100?.rankName).toBe("Expert");
			
			const rank200 = roleManagementService.getUserEligibleRank(guildId, 200);
			expect(rank200?.rankName).toBe("Expert");
		});

		it("should handle overlapping rank requirements correctly", () => {
			// Add ranks with same RP requirement (edge case)
			roleManagementService.addRank(guildId, "RankA", 50, "role_a");
			roleManagementService.addRank(guildId, "RankB", 50, "role_b");

			const ranks = roleManagementService.getRanksForGuild(guildId);
			expect(ranks).toHaveLength(2);

			// Should return one of them (deterministic based on creation order)
			const eligibleRank = roleManagementService.getUserEligibleRank(guildId, 50);
			expect(eligibleRank).toBeTruthy();
			expect(eligibleRank?.requiredRp).toBe(50);
		});

		it("should support cross-guild rank isolation", () => {
			// Add different ranks to different guilds
			roleManagementService.addRank(guildId, "Neuling", 25, "role_neuling_g1");
			roleManagementService.addRank(guild2Id, "Beginner", 30, "role_beginner_g2");

			const guild1Ranks = roleManagementService.getRanksForGuild(guildId);
			const guild2Ranks = roleManagementService.getRanksForGuild(guild2Id);

			expect(guild1Ranks).toHaveLength(1);
			expect(guild1Ranks[0].rankName).toBe("Neuling");
			
			expect(guild2Ranks).toHaveLength(1);
			expect(guild2Ranks[0].rankName).toBe("Beginner");

			// Test cross-guild eligibility
			expect(roleManagementService.getUserEligibleRank(guildId, 30)).toBeTruthy();
			expect(roleManagementService.getUserEligibleRank(guild2Id, 25)).toBeNull();
		});

		it("should remove ranks correctly", () => {
			// Add rank
			roleManagementService.addRank(guildId, "TestRank", 25, "role_test");
			expect(roleManagementService.rankExists(guildId, "TestRank")).toBe(true);

			// Remove rank
			const removed = roleManagementService.removeRank(guildId, "TestRank");
			expect(removed).toBe(true);
			expect(roleManagementService.rankExists(guildId, "TestRank")).toBe(false);

			// Try to remove non-existent rank
			const removedAgain = roleManagementService.removeRank(guildId, "TestRank");
			expect(removedAgain).toBe(false);
		});
	});

	describe("Discord Role Management", () => {
		it("should update user rank when they qualify for first rank", async () => {
			// Setup ranks
			roleManagementService.addRank(guildId, "Neuling", 25, "role_neuling");
			
			const mockGuild = createMockGuild(guildId) as any;
			const userId = "user_123";

			// Test user with 25 RP
			const result = await discordRoleService.updateUserRank(mockGuild, userId, 25);

			expect(result.success).toBe(true);
			expect(result.updated).toBe(true);
			expect(result.newRole).toBe("Neuling");
			expect(result.previousRole).toBeUndefined();

			// Verify role was added
			const mockMember = await mockGuild.members.fetch(userId);
			expect(mockMember.roles.add).toHaveBeenCalledWith("role_neuling", "Reputation rank promotion");
		});

		it("should promote user from lower to higher rank", async () => {
			// Setup ranks
			roleManagementService.addRank(guildId, "Neuling", 25, "role_neuling");
			roleManagementService.addRank(guildId, "Guide", 50, "role_guide");
			
			const mockGuild = createMockGuild(guildId) as any;
			const userId = "user_123";

			// Create a member with Neuling role and ensure the guild always returns this same member
			const mockMember = createMockMember(userId, ["role_neuling"]);
			mockGuild.members.fetch.mockResolvedValue(mockMember);

			// Test user with 50 RP (should get Guide, lose Neuling)
			const result = await discordRoleService.updateUserRank(mockGuild, userId, 50);

			expect(result.success).toBe(true);
			expect(result.updated).toBe(true);
			expect(result.newRole).toBe("Guide");
			expect(result.previousRole).toBe("Role_role_neuling");

			// Verify role changes on the same member object
			expect(mockMember.roles.remove).toHaveBeenCalledWith("role_neuling", "Reputation rank update");
			expect(mockMember.roles.add).toHaveBeenCalledWith("role_guide", "Reputation rank promotion");
		});

		it("should not update if user already has correct rank", async () => {
			// Setup ranks
			roleManagementService.addRank(guildId, "Guide", 50, "role_guide");
			
			const mockGuild = createMockGuild(guildId) as any;
			const userId = "user_123";

			// Mock user already has Guide role
			mockGuild.members.fetch.mockResolvedValueOnce(createMockMember(userId, ["role_guide"]));

			// Test user with 75 RP (still qualifies for Guide, no higher rank)
			const result = await discordRoleService.updateUserRank(mockGuild, userId, 75);

			expect(result.success).toBe(true);
			expect(result.updated).toBe(false);
			expect(result.newRole).toBe("Role_role_guide");
			expect(result.previousRole).toBe("Role_role_guide");

			// Verify no role changes
			const mockMember = await mockGuild.members.fetch(userId);
			expect(mockMember.roles.remove).not.toHaveBeenCalled();
			expect(mockMember.roles.add).not.toHaveBeenCalled();
		});

		it("should handle user with no qualifying ranks", async () => {
			// Setup ranks
			roleManagementService.addRank(guildId, "Neuling", 25, "role_neuling");
			
			const mockGuild = createMockGuild(guildId) as any;
			const userId = "user_123";

			// Test user with 10 RP (doesn't qualify for any rank)
			const result = await discordRoleService.updateUserRank(mockGuild, userId, 10);

			expect(result.success).toBe(true);
			expect(result.updated).toBe(false); // No update needed - user has no roles and qualifies for no roles
			expect(result.newRole).toBeUndefined();

			// Verify no roles added or removed since user has no roles and qualifies for none
			const mockMember = await mockGuild.members.fetch(userId);
			expect(mockMember.roles.add).not.toHaveBeenCalled();
			expect(mockMember.roles.remove).not.toHaveBeenCalled();
		});
	});

	describe("Integration with Reputation System", () => {
		it("should sync existing users with correct ranks", async () => {
			// Setup ranks
			roleManagementService.addRank(guildId, "Neuling", 25, "role_neuling");
			roleManagementService.addRank(guildId, "Guide", 50, "role_guide");

			// Add reputation data for users
			reputationService.trackReputationReaction({
				guildId,
				messageId: generateMessageId(),
				toUserId: "user_1",
				fromUserId: "system",
				emoji: "daily_bonus",
				amount: 30,
			});

			reputationService.trackReputationReaction({
				guildId,
				messageId: generateMessageId(),
				toUserId: "user_2",
				fromUserId: "system",
				emoji: "introduction_post",
				amount: 60,
			});

			const mockGuild = createMockGuild(guildId) as any;

			// Test sync
			const result = await discordRoleService.syncAllUserRanks(mockGuild);

			expect(result.success).toBe(2);
			expect(result.failed).toBe(0);

			// Verify both users got appropriate roles
			expect(mockGuild.members.fetch).toHaveBeenCalledWith("user_1");
			expect(mockGuild.members.fetch).toHaveBeenCalledWith("user_2");
		});

		it("should handle multiple rank levels progression", async () => {
			// Setup comprehensive rank system
			roleManagementService.addRank(guildId, "Neuling", 25, "role_neuling");
			roleManagementService.addRank(guildId, "Guide", 50, "role_guide");
			roleManagementService.addRank(guildId, "Expert", 100, "role_expert");
			roleManagementService.addRank(guildId, "Master", 200, "role_master");

			const mockGuild = createMockGuild(guildId) as any;
			mockGuild.roles.cache.set("role_master", { id: "role_master", name: "Master" });

			const userId = "user_progression";

			// Test progression: 0 → 25 → 50 → 100 → 200 RP
			
			// 25 RP: Should get Neuling
			let result = await discordRoleService.updateUserRank(mockGuild, userId, 25);
			expect(result.newRole).toBe("Neuling");

			// 50 RP: Should get Guide, lose Neuling
			mockGuild.members.fetch.mockResolvedValueOnce(createMockMember(userId, ["role_neuling"]));
			result = await discordRoleService.updateUserRank(mockGuild, userId, 50);
			expect(result.newRole).toBe("Guide");

			// 100 RP: Should get Expert, lose Guide
			mockGuild.members.fetch.mockResolvedValueOnce(createMockMember(userId, ["role_guide"]));
			result = await discordRoleService.updateUserRank(mockGuild, userId, 100);
			expect(result.newRole).toBe("Expert");

			// 200 RP: Should get Master, lose Expert
			mockGuild.members.fetch.mockResolvedValueOnce(createMockMember(userId, ["role_expert"]));
			result = await discordRoleService.updateUserRank(mockGuild, userId, 200);
			expect(result.newRole).toBe("Master");
		});
	});

	describe("Edge Cases and Error Handling", () => {
		it("should handle guild with no ranks configured", async () => {
			const mockGuild = createMockGuild(guildId) as any;
			const userId = "user_123";

			const result = await discordRoleService.updateUserRank(mockGuild, userId, 100);

			expect(result.success).toBe(true);
			expect(result.updated).toBe(false); // No update needed - no ranks configured and user has no roles
			expect(result.newRole).toBeUndefined();
		});

		it("should handle missing Discord roles gracefully", async () => {
			// Setup rank with non-existent role
			roleManagementService.addRank(guildId, "MissingRole", 25, "nonexistent_role");
			
			const mockGuild = createMockGuild(guildId) as any;
			const userId = "user_123";

			const result = await discordRoleService.updateUserRank(mockGuild, userId, 25);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Role nonexistent_role not found");
		});

		it("should handle user not in guild anymore", async () => {
			roleManagementService.addRank(guildId, "Neuling", 25, "role_neuling");
			
			const mockGuild = createMockGuild(guildId) as any;
			mockGuild.members.fetch.mockRejectedValue(new Error("User not found"));

			const result = await discordRoleService.updateUserRank(mockGuild, "missing_user", 25);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Member not found in guild");
		});

		it("should validate rank roles exist in guild", () => {
			// Setup ranks
			roleManagementService.addRank(guildId, "ValidRank", 25, "role_neuling");
			roleManagementService.addRank(guildId, "InvalidRank", 50, "missing_role");

			const mockGuild = createMockGuild(guildId) as any;
			const validation = discordRoleService.validateRankRoles(mockGuild);

			expect(validation.valid).toContain("ValidRank");
			expect(validation.invalid).toContain("InvalidRank");
		});
	});

	describe("Cross-Guild Isolation", () => {
		it("should track ranks separately per guild", () => {
			// Add same rank name to different guilds
			roleManagementService.addRank(guildId, "Member", 25, "role_member_g1");
			roleManagementService.addRank(guild2Id, "Member", 50, "role_member_g2");

			const rank1 = roleManagementService.getUserEligibleRank(guildId, 30);
			const rank2 = roleManagementService.getUserEligibleRank(guild2Id, 30);

			expect(rank1?.rankName).toBe("Member");
			expect(rank1?.requiredRp).toBe(25);
			expect(rank1?.roleId).toBe("role_member_g1");

			expect(rank2).toBeNull(); // 30 RP doesn't qualify for 50 RP requirement in guild2
		});

		it("should sync ranks independently per guild", async () => {
			// Setup different ranks for each guild
			roleManagementService.addRank(guildId, "Novice", 20, "role_novice");
			roleManagementService.addRank(guild2Id, "Starter", 40, "role_starter");

			// Add same user with same RP to both guilds
			const userId = "cross_guild_user";
			reputationService.trackReputationReaction({
				guildId,
				messageId: generateMessageId(),
				toUserId: userId,
				fromUserId: "system",
				emoji: "bonus",
				amount: 30,
			});

			reputationService.trackReputationReaction({
				guildId: guild2Id,
				messageId: generateMessageId(),
				toUserId: userId,
				fromUserId: "system",
				emoji: "bonus",
				amount: 30,
			});

			const mockGuild1 = createMockGuild(guildId) as any;
			const mockGuild2 = createMockGuild(guild2Id) as any;

			// User should qualify for rank in guild1 (30 >= 20) but not guild2 (30 < 40)
			const result1 = await discordRoleService.syncAllUserRanks(mockGuild1);
			const result2 = await discordRoleService.syncAllUserRanks(mockGuild2);

			expect(result1.success).toBe(1);
			expect(result2.success).toBe(1); // Success but no rank change
		});
	});
});