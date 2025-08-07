import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleManageRanksCommand } from "@/bot/commands/manageRanks";
import { roleManagementService } from "@/core/services/roleManagementService";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { generateGuildId } from "../setup/testUtils";
import { db } from "@/db/sqlite";

describe("Manage Ranks Validate Command", () => {
	let guildId: string;

	beforeEach(() => {
		// Clean database
		db.exec("DELETE FROM reputation_ranks");
		guildId = generateGuildId();
	});

	it("should show validation results for bot permissions", async () => {
		const mockInteraction = {
			options: {
				getSubcommand: vi.fn().mockReturnValue("validate"),
			},
			memberPermissions: {
				has: vi.fn().mockReturnValue(true), // User has admin permission
			},
			guild: {
				id: guildId,
				members: {
					me: {
						permissions: {
							has: vi.fn().mockImplementation((perm) => {
								return perm === PermissionFlagsBits.ManageRoles;
							}),
						},
						roles: {
							highest: {
								name: "Bot Role",
								position: 50,
							},
						},
					},
				},
			},
			reply: vi.fn(),
		} as any;

		await handleManageRanksCommand(mockInteraction);

		expect(mockInteraction.reply).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.stringContaining("Bot-Berechtigungen"),
				flags: MessageFlags.Ephemeral,
			})
		);

		const replyContent = mockInteraction.reply.mock.calls[0][0].content;
		expect(replyContent).toContain("Rollen verwalten: ✅");
		expect(replyContent).toContain("Höchste Bot-Rolle: Bot Role (Position: 50)");
	});

	it("should report missing ManageRoles permission", async () => {
		const mockInteraction = {
			options: {
				getSubcommand: vi.fn().mockReturnValue("validate"),
			},
			memberPermissions: {
				has: vi.fn().mockReturnValue(true), // User has admin permission
			},
			guild: {
				id: guildId,
				members: {
					me: {
						permissions: {
							has: vi.fn().mockReturnValue(false), // No ManageRoles permission
						},
						roles: {
							highest: {
								name: "Bot Role",
								position: 50,
							},
						},
					},
				},
			},
			reply: vi.fn(),
		} as any;

		await handleManageRanksCommand(mockInteraction);

		const replyContent = mockInteraction.reply.mock.calls[0][0].content;
		expect(replyContent).toContain("Rollen verwalten: ❌ FEHLT");
		expect(replyContent).toContain("Der Bot benötigt die 'Rollen verwalten' Berechtigung");
	});

	it("should validate configured ranks and show hierarchy issues", async () => {
		// Setup some ranks
		roleManagementService.addRank(guildId, "TestRank1", 50, "role_1");
		roleManagementService.addRank(guildId, "TestRank2", 100, "role_2");

		const mockInteraction = {
			options: {
				getSubcommand: vi.fn().mockReturnValue("validate"),
			},
			memberPermissions: {
				has: vi.fn().mockReturnValue(true), // User has admin permission
			},
			guild: {
				id: guildId,
				members: {
					me: {
						permissions: {
							has: vi.fn().mockReturnValue(true),
						},
						roles: {
							highest: {
								name: "Bot Role",
								position: 50,
							},
						},
					},
				},
				roles: {
					cache: {
						get: vi.fn().mockImplementation((roleId) => {
							if (roleId === "role_1") {
								return { id: "role_1", name: "Role1", position: 30 }; // Below bot role
							}
							if (roleId === "role_2") {
								return { id: "role_2", name: "Role2", position: 60 }; // Above bot role
							}
							return undefined;
						}),
					},
				},
			},
			reply: vi.fn(),
		} as any;

		await handleManageRanksCommand(mockInteraction);

		const replyContent = mockInteraction.reply.mock.calls[0][0].content;
		expect(replyContent).toContain("✅ Verwaltbar: 1");
		expect(replyContent).toContain("⚠️ Nicht verwaltbar: 1");
		expect(replyContent).toContain("TestRank2:");
		expect(replyContent).toContain("above bot's highest role");
	});

	it("should report when no ranks are configured", async () => {
		const mockInteraction = {
			options: {
				getSubcommand: vi.fn().mockReturnValue("validate"),
			},
			memberPermissions: {
				has: vi.fn().mockReturnValue(true), // User has admin permission
			},
			guild: {
				id: guildId,
				members: {
					me: {
						permissions: {
							has: vi.fn().mockReturnValue(true),
						},
						roles: {
							highest: {
								name: "Bot Role",
								position: 50,
							},
						},
					},
				},
			},
			reply: vi.fn(),
		} as any;

		await handleManageRanksCommand(mockInteraction);

		const replyContent = mockInteraction.reply.mock.calls[0][0].content;
		expect(replyContent).toContain("❌ **Keine Ränge konfiguriert**");
		expect(replyContent).toContain("/manage-ranks add");
	});

	it("should report success when all ranks are properly configured", async () => {
		// Setup a properly configured rank
		roleManagementService.addRank(guildId, "TestRank", 50, "role_1");

		const mockInteraction = {
			options: {
				getSubcommand: vi.fn().mockReturnValue("validate"),
			},
			memberPermissions: {
				has: vi.fn().mockReturnValue(true), // User has admin permission
			},
			guild: {
				id: guildId,
				members: {
					me: {
						permissions: {
							has: vi.fn().mockReturnValue(true),
						},
						roles: {
							highest: {
								name: "Bot Role",
								position: 50,
							},
						},
					},
				},
				roles: {
					cache: {
						get: vi.fn().mockImplementation((roleId) => {
							if (roleId === "role_1") {
								return { id: "role_1", name: "Role1", position: 30 }; // Below bot role
							}
							return undefined;
						}),
					},
				},
			},
			reply: vi.fn(),
		} as any;

		await handleManageRanksCommand(mockInteraction);

		const replyContent = mockInteraction.reply.mock.calls[0][0].content;
		expect(replyContent).toContain("✅ Verwaltbar: 1");
		expect(replyContent).toContain("Alle Ränge sind korrekt konfiguriert und verwaltbar!");
	});
});