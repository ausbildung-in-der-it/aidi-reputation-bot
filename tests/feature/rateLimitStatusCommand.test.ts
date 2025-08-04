import { describe, it, expect, beforeEach } from "vitest";
import { rateLimitStatusService } from "@/core/services/rateLimitStatusService";
import { rateLimitService } from "@/core/services/rateLimitService";
import { dailyBonusService } from "@/core/services/dailyBonusService";
import { introductionReplyService } from "@/core/services/introductionReplyService";
import { db } from "@/db/sqlite";
import { createTestUser, generateGuildId } from "../setup/testUtils";

describe("Rate Limit Status Command", () => {
	let testGuildId: string;

	beforeEach(() => {
		// Clean up test database for each test
		db.exec("DELETE FROM reputation_events");
		db.exec("DELETE FROM reputation_rate_limits");
		db.exec("DELETE FROM daily_bonus_tracking");
		db.exec("DELETE FROM introduction_reply_tracking");

		testGuildId = generateGuildId();
	});

	describe("getUserRateLimitStatus", () => {
		it("should return complete rate limit status for user", () => {
			const testUser = createTestUser("user_123");

			const status = rateLimitStatusService.getUserRateLimitStatus(testGuildId, testUser.id);

			expect(status).toMatchObject({
				trophies: {
					used: 0,
					limit: 5,
					remaining: 5,
				},
				dailyBonus: {
					received: false,
					available: true,
				},
				introductionPost: {
					available: true,
					bonus: 5,
				},
				introductionReplies: {
					used: 0,
					limit: 5,
					remaining: 5,
				},
			});
		});

		it("should show trophy usage after awarding reputation", () => {
			const giver = createTestUser("giver_123");
			const recipient = createTestUser("recipient_456");

			// Award a trophy
			rateLimitService.recordAward(testGuildId, giver.id, recipient.id);

			const status = rateLimitStatusService.getUserRateLimitStatus(testGuildId, giver.id);

			expect(status.trophies).toMatchObject({
				used: 1,
				limit: 5,
				remaining: 4,
			});
		});

		it("should show daily bonus as received after claiming", () => {
			const testUser = createTestUser("user_123");

			// Claim daily bonus
			dailyBonusService.trackDailyBonus(testGuildId, testUser.id);

			const status = rateLimitStatusService.getUserRateLimitStatus(testGuildId, testUser.id);

			expect(status.dailyBonus).toMatchObject({
				received: true,
				available: false,
			});
		});

		it("should show introduction reply usage after replying", () => {
			const testUser = createTestUser("user_123");
			const originalMessageId = "original_msg_123";

			// Track a reply
			introductionReplyService.trackReply(testGuildId, testUser.id, originalMessageId);

			const status = rateLimitStatusService.getUserRateLimitStatus(testGuildId, testUser.id);

			expect(status.introductionReplies).toMatchObject({
				used: 1,
				limit: 5,
				remaining: 4,
			});
		});

		it("should show limits reached when at maximum", () => {
			const testUser = createTestUser("user_123");

			// Max out trophy limit (5 awards)
			for (let i = 0; i < 5; i++) {
				const recipient = createTestUser(`recipient_${i}`);
				rateLimitService.recordAward(testGuildId, testUser.id, recipient.id);
			}

			// Max out reply limit (5 replies)
			for (let i = 0; i < 5; i++) {
				introductionReplyService.trackReply(testGuildId, testUser.id, `msg_${i}`);
			}

			// Claim daily bonus
			dailyBonusService.trackDailyBonus(testGuildId, testUser.id);

			const status = rateLimitStatusService.getUserRateLimitStatus(testGuildId, testUser.id);

			expect(status.trophies).toMatchObject({
				used: 5,
				limit: 5,
				remaining: 0,
			});

			expect(status.dailyBonus).toMatchObject({
				received: true,
				available: false,
			});

			expect(status.introductionReplies).toMatchObject({
				used: 5,
				limit: 5,
				remaining: 0,
			});

			// Introduction post is always available
			expect(status.introductionPost).toMatchObject({
				available: true,
				bonus: 5,
			});
		});

		it("should isolate rate limits between different guilds", () => {
			const testUser = createTestUser("user_123");
			const otherGuildId = "other_guild_456";

			// Award in first guild
			const recipient1 = createTestUser("recipient_1");
			rateLimitService.recordAward(testGuildId, testUser.id, recipient1.id);

			// Award in second guild
			const recipient2 = createTestUser("recipient_2");
			rateLimitService.recordAward(otherGuildId, testUser.id, recipient2.id);

			const statusGuild1 = rateLimitStatusService.getUserRateLimitStatus(testGuildId, testUser.id);
			const statusGuild2 = rateLimitStatusService.getUserRateLimitStatus(otherGuildId, testUser.id);

			// Each guild should only see their own usage
			expect(statusGuild1.trophies.used).toBe(1);
			expect(statusGuild2.trophies.used).toBe(1);
		});
	});
});