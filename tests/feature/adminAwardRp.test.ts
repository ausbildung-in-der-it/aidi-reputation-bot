import { describe, it, expect, beforeEach, vi } from "vitest";
import { manualReputationService } from "@/core/services/manualReputationService";
import { reputationService } from "@/core/services/reputationService";
import { handleAwardRpCommand } from "@/bot/commands/awardRp";
import { db } from "@/db/sqlite";
import { createDiscordUser, generateGuildId } from "../setup/testUtils";

describe("Admin RP Award System", () => {
	let testGuildId: string;

	beforeEach(() => {
		// Clean up test database
		db.exec("DELETE FROM reputation_events");
		testGuildId = generateGuildId();
	});

	describe("manualReputationService", () => {
		it("should successfully award positive RP", () => {
			const result = manualReputationService.awardReputation({
				guildId: testGuildId,
				toUserId: "user_123",
				fromUserId: "admin_456",
				amount: 50,
				reason: "Great contribution",
			});

			expect(result.success).toBe(true);
			expect(result.newTotal).toBe(50);
			expect(result.awardId).toBeDefined();

			// Verify in database
			const userReputation = reputationService.getUserReputation(testGuildId, "user_123");
			expect(userReputation).toBe(50);
		});

		it("should successfully deduct negative RP", () => {
			// First give some RP
			manualReputationService.awardReputation({
				guildId: testGuildId,
				toUserId: "user_123",
				fromUserId: "admin_456",
				amount: 100,
			});

			// Then deduct some
			const result = manualReputationService.awardReputation({
				guildId: testGuildId,
				toUserId: "user_123",
				fromUserId: "admin_456",
				amount: -30,
				reason: "Spam penalty",
			});

			expect(result.success).toBe(true);
			expect(result.newTotal).toBe(70);

			const userReputation = reputationService.getUserReputation(testGuildId, "user_123");
			expect(userReputation).toBe(70);
		});

		it("should reject zero amount", () => {
			const result = manualReputationService.awardReputation({
				guildId: testGuildId,
				toUserId: "user_123",
				fromUserId: "admin_456",
				amount: 0,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Amount cannot be zero");
		});

		it("should reject amounts outside valid range", () => {
			const tooHigh = manualReputationService.awardReputation({
				guildId: testGuildId,
				toUserId: "user_123",
				fromUserId: "admin_456",
				amount: 1001,
			});

			const tooLow = manualReputationService.awardReputation({
				guildId: testGuildId,
				toUserId: "user_123",
				fromUserId: "admin_456",
				amount: -1001,
			});

			expect(tooHigh.success).toBe(false);
			expect(tooHigh.error).toBe("Amount must be between -1000 and +1000");

			expect(tooLow.success).toBe(false);
			expect(tooLow.error).toBe("Amount must be between -1000 and +1000");
		});

		it("should create audit trail with admin_award emoji", () => {
			manualReputationService.awardReputation({
				guildId: testGuildId,
				toUserId: "user_123",
				fromUserId: "admin_456",
				amount: 25,
			});

			// Check that event was recorded with correct emoji
			const stmt = db.prepare(`
                SELECT * FROM reputation_events 
                WHERE guild_id = ? AND to_user_id = ? AND from_user_id = ? AND emoji = ?
            `);
			const event = stmt.get(testGuildId, "user_123", "admin_456", "admin_award");

			expect(event).toBeTruthy();
			expect((event as any).amount).toBe(25);
		});
	});

	describe("Discord Command Handler", () => {
		it("should allow admin to award RP to another user", async () => {
			const admin = createDiscordUser("admin_123");
			const targetUser = createDiscordUser("target_456");

			const mockInteraction = {
				guild: { id: testGuildId },
				user: admin,
				memberPermissions: {
					has: vi.fn().mockReturnValue(true), // Is admin
				},
				options: {
					getUser: vi.fn().mockReturnValue(targetUser),
					getInteger: vi.fn().mockReturnValue(100),
					getString: vi.fn().mockReturnValue("Good work!"),
				},
				reply: vi.fn(),
			} as any;

			await handleAwardRpCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.any(Array),
			});

			// Verify RP was awarded
			const userReputation = reputationService.getUserReputation(testGuildId, targetUser.id);
			expect(userReputation).toBe(100);
		});

		it("should deny non-admin users", async () => {
			const user = createDiscordUser("user_123");
			const targetUser = createDiscordUser("target_456");

			const mockInteraction = {
				guild: { id: testGuildId },
				user: user,
				memberPermissions: {
					has: vi.fn().mockReturnValue(false), // Not admin
				},
				options: {
					getUser: vi.fn().mockReturnValue(targetUser),
					getInteger: vi.fn().mockReturnValue(100),
					getString: vi.fn().mockReturnValue(null),
				},
				reply: vi.fn(),
			} as any;

			await handleAwardRpCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: "Du benötigst Administrator-Berechtigung um RP zu vergeben.",
				ephemeral: true,
			});

			// Verify no RP was awarded
			const userReputation = reputationService.getUserReputation(testGuildId, targetUser.id);
			expect(userReputation).toBe(0);
		});

		it("should prevent admin from awarding RP to themselves", async () => {
			const admin = createDiscordUser("admin_123");

			const mockInteraction = {
				guild: { id: testGuildId },
				user: admin,
				memberPermissions: {
					has: vi.fn().mockReturnValue(true), // Is admin
				},
				options: {
					getUser: vi.fn().mockReturnValue(admin), // Same user
					getInteger: vi.fn().mockReturnValue(100),
					getString: vi.fn().mockReturnValue(null),
				},
				reply: vi.fn(),
			} as any;

			await handleAwardRpCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: "Du kannst dir nicht selbst RP vergeben.",
				ephemeral: true,
			});
		});

		it("should prevent awarding RP to bots", async () => {
			const admin = createDiscordUser("admin_123");
			const botUser = { ...createDiscordUser("bot_456"), bot: true };

			const mockInteraction = {
				guild: { id: testGuildId },
				user: admin,
				memberPermissions: {
					has: vi.fn().mockReturnValue(true), // Is admin
				},
				options: {
					getUser: vi.fn().mockReturnValue(botUser),
					getInteger: vi.fn().mockReturnValue(100),
					getString: vi.fn().mockReturnValue(null),
				},
				reply: vi.fn(),
			} as any;

			await handleAwardRpCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: "Du kannst Bots keine RP vergeben.",
				ephemeral: true,
			});
		});

		it("should handle guild-only restriction", async () => {
			const admin = createDiscordUser("admin_123");
			const targetUser = createDiscordUser("target_456");

			const mockInteraction = {
				guild: null, // Not in guild
				user: admin,
				options: {
					getUser: vi.fn().mockReturnValue(targetUser),
					getInteger: vi.fn().mockReturnValue(100),
					getString: vi.fn().mockReturnValue(null),
				},
				reply: vi.fn(),
			} as any;

			await handleAwardRpCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: "Dieser Command kann nur in einem Server verwendet werden.",
				ephemeral: true,
			});
		});

		it("should handle negative RP awards (deductions)", async () => {
			const admin = createDiscordUser("admin_123");
			const targetUser = createDiscordUser("target_456");

			const mockInteraction = {
				guild: { id: testGuildId },
				user: admin,
				memberPermissions: {
					has: vi.fn().mockReturnValue(true), // Is admin
				},
				options: {
					getUser: vi.fn().mockReturnValue(targetUser),
					getInteger: vi.fn().mockReturnValue(-50),
					getString: vi.fn().mockReturnValue("Rule violation"),
				},
				reply: vi.fn(),
			} as any;

			await handleAwardRpCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.any(Array),
			});

			// Verify RP was deducted
			const userReputation = reputationService.getUserReputation(testGuildId, targetUser.id);
			expect(userReputation).toBe(-50);
		});
	});

	describe("Guild Isolation", () => {
		it("should isolate admin awards between guilds", () => {
			const otherGuildId = generateGuildId();

			// Award in first guild
			manualReputationService.awardReputation({
				guildId: testGuildId,
				toUserId: "user_123",
				fromUserId: "admin_456",
				amount: 100,
			});

			// Award in second guild
			manualReputationService.awardReputation({
				guildId: otherGuildId,
				toUserId: "user_123",
				fromUserId: "admin_456",
				amount: 200,
			});

			// Each guild should see only their own awards
			const reputationGuild1 = reputationService.getUserReputation(testGuildId, "user_123");
			const reputationGuild2 = reputationService.getUserReputation(otherGuildId, "user_123");

			expect(reputationGuild1).toBe(100);
			expect(reputationGuild2).toBe(200);
		});
	});
});