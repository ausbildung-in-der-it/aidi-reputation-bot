import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { awardDailyBonus } from "@/core/usecases/awardDailyBonus";
import { reputationService } from "@/core/services/reputationService";
import { dailyBonusService } from "@/core/services/dailyBonusService";
import { db } from "@/db/sqlite";
import { createTestUser, generateGuildId, generateMessageId } from "../setup/testUtils";

// Mock config for reliable tests
vi.mock("@/config/reputation", () => ({
	DAILY_BONUS_CONFIG: {
		enabled: true,
		points: 1,
		timezone: "Europe/Berlin",
	},
	getCurrentDateInTimezone: (timezone: string) => "2024-01-15", // Fixed test date
}));

describe("User Receives Daily Bonus", () => {
	let guildId: string;
	let messageId: string;

	beforeEach(async () => {
		// Clean up test database for each test
		db.exec("DELETE FROM reputation_events");
		db.exec("DELETE FROM reputation_rate_limits");
		db.exec("DELETE FROM daily_bonus_tracking");

		guildId = generateGuildId();
		messageId = generateMessageId();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Happy Path: Daily bonus award", () => {
		it("should award 1 RP for first message of the day", async () => {
			const user = createTestUser("user_123", {
				username: "alice",
				displayName: "Alice",
			});

			const result = await awardDailyBonus({
				guildId,
				user,
				messageId,
			});

			// Assert: Award succeeded
			expect(result.success).toBe(true);
			expect(result.awarded).toBe(true);
			expect(result.points).toBe(1);
			expect(result.reason).toBe("Daily bonus awarded for first message of the day");
			expect(result.bonusDate).toBe("2024-01-15");

			// Assert: Reputation is persisted
			const userReputation = reputationService.getUserReputation(guildId, user.id);
			expect(userReputation).toBe(1);

			// Assert: Daily bonus is tracked
			const bonusCheck = dailyBonusService.checkDailyBonus(guildId, user.id);
			expect(bonusCheck.canReceive).toBe(false);
			expect(bonusCheck.alreadyReceived).toBe(true);
		});

		it("should work for multiple users on same day", async () => {
			const user1 = createTestUser("user_1");
			const user2 = createTestUser("user_2");
			const user3 = createTestUser("user_3");

			// All three users get their daily bonus
			const results = await Promise.all([
				awardDailyBonus({ guildId, user: user1, messageId: generateMessageId() }),
				awardDailyBonus({ guildId, user: user2, messageId: generateMessageId() }),
				awardDailyBonus({ guildId, user: user3, messageId: generateMessageId() }),
			]);

			// All awards should succeed
			results.forEach(result => {
				expect(result.success).toBe(true);
				expect(result.awarded).toBe(true);
				expect(result.points).toBe(1);
			});

			// Each user should have 1 reputation
			expect(reputationService.getUserReputation(guildId, user1.id)).toBe(1);
			expect(reputationService.getUserReputation(guildId, user2.id)).toBe(1);
			expect(reputationService.getUserReputation(guildId, user3.id)).toBe(1);
		});
	});

	describe("Business Rules Enforcement", () => {
		it("should not award bonus twice on same day", async () => {
			const user = createTestUser("user_123");

			// First message - should get bonus
			const result1 = await awardDailyBonus({
				guildId,
				user,
				messageId: generateMessageId(),
			});

			expect(result1.success).toBe(true);
			expect(result1.awarded).toBe(true);
			expect(result1.points).toBe(1);

			// Second message same day - should not get bonus
			const result2 = await awardDailyBonus({
				guildId,
				user,
				messageId: generateMessageId(),
			});

			expect(result2.success).toBe(true);
			expect(result2.awarded).toBe(false);
			expect(result2.points).toBe(0);
			expect(result2.reason).toBe("Daily bonus already received today");

			// User should still have only 1 reputation
			const finalReputation = reputationService.getUserReputation(guildId, user.id);
			expect(finalReputation).toBe(1);
		});

		it("should prevent bots from receiving daily bonus", async () => {
			const bot = createTestUser("bot_123", {
				isBot: true,
				username: "helper-bot",
			});

			const result = await awardDailyBonus({
				guildId,
				user: bot,
				messageId,
			});

			expect(result.success).toBe(true);
			expect(result.awarded).toBe(false);
			expect(result.points).toBe(0);
			expect(result.reason).toBe("Bots cannot receive daily bonus");

			// Bot should have no reputation
			const botReputation = reputationService.getUserReputation(guildId, bot.id);
			expect(botReputation).toBe(0);
		});

		// Note: Testing disabled config requires a separate test file due to module mocking limitations
		// This test verifies the behavior when enabled=true (which is the default mock)
		it("should award when daily bonus is enabled", async () => {
			const user = createTestUser("user_123");

			const result = await awardDailyBonus({
				guildId,
				user,
				messageId,
			});

			expect(result.success).toBe(true);
			expect(result.awarded).toBe(true);
			expect(result.points).toBe(1);
			expect(result.reason).toBe("Daily bonus awarded for first message of the day");

			// User should have 1 reputation
			const userReputation = reputationService.getUserReputation(guildId, user.id);
			expect(userReputation).toBe(1);
		});
	});

	describe("Cross-Guild Isolation", () => {
		it("should track daily bonus separately per guild", async () => {
			const user = createTestUser("user_123");
			const guild1Id = generateGuildId();
			const guild2Id = generateGuildId();

			// User gets bonus in guild 1
			const result1 = await awardDailyBonus({
				guildId: guild1Id,
				user,
				messageId: generateMessageId(),
			});

			// User should also get bonus in guild 2
			const result2 = await awardDailyBonus({
				guildId: guild2Id,
				user,
				messageId: generateMessageId(),
			});

			// Both awards should succeed
			expect(result1.success).toBe(true);
			expect(result1.awarded).toBe(true);
			expect(result2.success).toBe(true);
			expect(result2.awarded).toBe(true);

			// User should have 1 reputation in each guild
			expect(reputationService.getUserReputation(guild1Id, user.id)).toBe(1);
			expect(reputationService.getUserReputation(guild2Id, user.id)).toBe(1);

			// But second message in guild 1 should not award bonus
			const result3 = await awardDailyBonus({
				guildId: guild1Id,
				user,
				messageId: generateMessageId(),
			});

			expect(result3.awarded).toBe(false);
			expect(reputationService.getUserReputation(guild1Id, user.id)).toBe(1);
		});
	});
});