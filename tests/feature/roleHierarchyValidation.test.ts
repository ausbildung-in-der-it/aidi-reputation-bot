import { describe, it, expect, beforeEach, vi } from "vitest";
import { discordRoleService } from "@/bot/services/discordRoleService";
import { roleManagementService } from "@/core/services/roleManagementService";
import { generateGuildId } from "../setup/testUtils";
import { db } from "@/db/sqlite";

describe("Role Hierarchy Validation", () => {
	let guildId: string;

	beforeEach(() => {
		// Clean database
		db.exec("DELETE FROM reputation_ranks");
		guildId = generateGuildId();
	});

	describe("canBotManageRole", () => {
		it("should return true when bot's highest role is above target role", () => {
			const mockGuild = {
				members: {
					me: {
						roles: {
							highest: {
								position: 100,
							},
						},
					},
				},
				roles: {
					cache: {
						get: vi.fn().mockReturnValue({
							id: "target_role",
							position: 50, // Below bot's highest role
						}),
					},
				},
			} as any;

			const result = discordRoleService.canBotManageRole(mockGuild, "target_role");
			expect(result).toBe(true);
		});

		it("should return false when bot's highest role is below target role", () => {
			const mockGuild = {
				members: {
					me: {
						roles: {
							highest: {
								position: 50,
							},
						},
					},
				},
				roles: {
					cache: {
						get: vi.fn().mockReturnValue({
							id: "target_role",
							position: 100, // Above bot's highest role
						}),
					},
				},
			} as any;

			const result = discordRoleService.canBotManageRole(mockGuild, "target_role");
			expect(result).toBe(false);
		});

		it("should return false when bot's highest role is at same position as target role", () => {
			const mockGuild = {
				members: {
					me: {
						roles: {
							highest: {
								position: 50,
							},
						},
					},
				},
				roles: {
					cache: {
						get: vi.fn().mockReturnValue({
							id: "target_role",
							position: 50, // Same position as bot's highest role
						}),
					},
				},
			} as any;

			const result = discordRoleService.canBotManageRole(mockGuild, "target_role");
			expect(result).toBe(false);
		});

		it("should return false when bot member is not found", () => {
			const mockGuild = {
				members: {
					me: undefined,
				},
				roles: {
					cache: {
						get: vi.fn().mockReturnValue({
							id: "target_role",
							position: 50,
						}),
					},
				},
			} as any;

			const result = discordRoleService.canBotManageRole(mockGuild, "target_role");
			expect(result).toBe(false);
		});

		it("should return false when role is not found", () => {
			const mockGuild = {
				members: {
					me: {
						roles: {
							highest: {
								position: 100,
							},
						},
					},
				},
				roles: {
					cache: {
						get: vi.fn().mockReturnValue(undefined),
					},
				},
			} as any;

			const result = discordRoleService.canBotManageRole(mockGuild, "nonexistent_role");
			expect(result).toBe(false);
		});
	});

	describe("updateUserRank with hierarchy checks", () => {
		it("should fail when trying to add a role above bot's hierarchy", async () => {
			roleManagementService.addRank(guildId, "HighRank", 100, "high_role");

			const mockGuild = {
				id: guildId,
				members: {
					me: {
						permissions: {
							has: vi.fn().mockReturnValue(true), // Has ManageRoles
						},
						roles: {
							highest: {
								position: 50,
							},
						},
					},
					fetch: vi.fn().mockResolvedValue({
						id: "user_123",
						roles: {
							cache: {
								find: vi.fn().mockReturnValue(undefined), // No current role
							},
							add: vi.fn(),
							remove: vi.fn(),
						},
					}),
				},
				roles: {
					cache: {
						get: vi.fn().mockImplementation((roleId) => {
							if (roleId === "high_role") {
								return {
									id: "high_role",
									name: "HighRank",
									position: 100, // Above bot's position
								};
							}
							return undefined;
						}),
					},
				},
			} as any;

			const result = await discordRoleService.updateUserRank(mockGuild, "user_123", 100);

			expect(result.success).toBe(false);
			expect(result.errorType).toBe("hierarchy");
			expect(result.error).toContain("Bot cannot manage role");
			expect(result.error).toContain("check role hierarchy");
		});

		it("should fail when trying to remove a role above bot's hierarchy", async () => {
			roleManagementService.addRank(guildId, "LowRank", 10, "low_role");
			roleManagementService.addRank(guildId, "HighRank", 100, "high_role");

			const mockGuild = {
				id: guildId,
				members: {
					me: {
						permissions: {
							has: vi.fn().mockReturnValue(true), // Has ManageRoles
						},
						roles: {
							highest: {
								position: 50,
							},
						},
					},
					fetch: vi.fn().mockResolvedValue({
						id: "user_123",
						roles: {
							cache: {
								find: vi.fn().mockReturnValue({
									id: "high_role",
									name: "HighRank",
									position: 100, // Above bot's position
								}),
							},
							add: vi.fn(),
							remove: vi.fn(),
						},
					}),
				},
				roles: {
					cache: {
						get: vi.fn().mockImplementation((roleId) => {
							if (roleId === "high_role") {
								return {
									id: "high_role",
									name: "HighRank",
									position: 100,
								};
							}
							if (roleId === "low_role") {
								return {
									id: "low_role",
									name: "LowRank",
									position: 20,
								};
							}
							return undefined;
						}),
					},
				},
			} as any;

			const result = await discordRoleService.updateUserRank(mockGuild, "user_123", 10);

			expect(result.success).toBe(false);
			expect(result.errorType).toBe("hierarchy");
			expect(result.error).toContain("HighRank");
			expect(result.error).toContain("check role hierarchy");
		});

		it("should succeed when roles are within bot's hierarchy", async () => {
			roleManagementService.addRank(guildId, "LowRank", 100, "low_role");

			const mockGuild = {
				id: guildId,
				members: {
					me: {
						permissions: {
							has: vi.fn().mockReturnValue(true), // Has ManageRoles
						},
						roles: {
							highest: {
								position: 100,
							},
						},
					},
					fetch: vi.fn().mockResolvedValue({
						id: "user_123",
						roles: {
							cache: {
								find: vi.fn().mockReturnValue(undefined), // No current role
							},
							add: vi.fn(),
							remove: vi.fn(),
						},
					}),
				},
				roles: {
					cache: {
						get: vi.fn().mockImplementation((roleId) => {
							if (roleId === "low_role") {
								return {
									id: "low_role",
									name: "LowRank",
									position: 50, // Below bot's position
								};
							}
							return undefined;
						}),
					},
				},
			} as any;

			const result = await discordRoleService.updateUserRank(mockGuild, "user_123", 100);

			expect(result.success).toBe(true);
			expect(result.updated).toBe(true);
			expect(result.newRole).toBe("LowRank");
		});
	});

	describe("validateRankRoles", () => {
		it("should categorize roles correctly based on hierarchy and existence", () => {
			roleManagementService.addRank(guildId, "ValidRank", 50, "valid_role");
			roleManagementService.addRank(guildId, "HighRank", 100, "high_role");
			roleManagementService.addRank(guildId, "MissingRank", 75, "missing_role");

			const mockGuild = {
				id: guildId,
				members: {
					me: {
						roles: {
							highest: {
								position: 50,
							},
						},
					},
				},
				roles: {
					cache: {
						get: vi.fn().mockImplementation((roleId) => {
							if (roleId === "valid_role") {
								return {
									id: "valid_role",
									name: "ValidRole",
									position: 30, // Below bot
								};
							}
							if (roleId === "high_role") {
								return {
									id: "high_role",
									name: "HighRole",
									position: 100, // Above bot
								};
							}
							// missing_role returns undefined
							return undefined;
						}),
					},
				},
			} as any;

			const result = discordRoleService.validateRankRoles(mockGuild);

			expect(result.valid).toContain("ValidRank");
			expect(result.unmanageable).toContain("HighRank");
			expect(result.invalid).toContain("MissingRank");
			expect(result.details.get("HighRank")).toContain("above bot's highest role");
			expect(result.details.get("MissingRank")).toContain("not found");
		});
	});
});