import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { configureIntroductionChannel, removeIntroductionChannel } from "@/core/usecases/configureIntroductionChannel";
import { awardIntroductionBonus } from "@/core/usecases/awardIntroductionBonus";
import { reputationService } from "@/core/services/reputationService";
import { introductionChannelService } from "@/core/services/introductionChannelService";
import { introductionReplyService } from "@/core/services/introductionReplyService";
import { db } from "@/db/sqlite";
import { createTestUser, createTestBot, generateGuildId, generateMessageId } from "../setup/testUtils";

// Mock config for reliable tests
vi.mock("@/config/reputation", () => ({
	INTRODUCTION_CONFIG: {
		enabled: true,
		postBonus: 5,
		replyBonus: 2,
		maxRepliesPerUser: 5,
	},
}));

describe("Introduction Channel System", () => {
	let guildId: string;
	let channelId: string;
	let otherChannelId: string;
	let adminUserId: string;

	beforeEach(async () => {
		// Clean up test database for each test
		db.exec("DELETE FROM reputation_events");
		db.exec("DELETE FROM reputation_rate_limits");
		db.exec("DELETE FROM daily_bonus_tracking");
		db.exec("DELETE FROM introduction_channel_config");
		db.exec("DELETE FROM introduction_reply_tracking");

		guildId = generateGuildId();
		channelId = generateMessageId(); // Using as channel ID
		otherChannelId = generateMessageId();
		adminUserId = "admin_123";
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Channel Configuration", () => {
		it("should successfully configure introduction channel", async () => {
			const result = await configureIntroductionChannel({
				guildId,
				channelId,
				configuredBy: adminUserId,
			});

			expect(result.success).toBe(true);
			expect(result.newChannelId).toBe(channelId);
			expect(result.previousChannelId).toBeUndefined();

			// Verify configuration is stored
			const config = introductionChannelService.getChannelConfig(guildId);
			expect(config).toBeTruthy();
			expect(config?.channelId).toBe(channelId);
			expect(config?.configuredBy).toBe(adminUserId);
		});

		it("should replace existing channel configuration", async () => {
			// First configuration
			await configureIntroductionChannel({
				guildId,
				channelId,
				configuredBy: adminUserId,
			});

			// Second configuration with different channel
			const result = await configureIntroductionChannel({
				guildId,
				channelId: otherChannelId,
				configuredBy: adminUserId,
			});

			expect(result.success).toBe(true);
			expect(result.newChannelId).toBe(otherChannelId);
			expect(result.previousChannelId).toBe(channelId);

			// Verify new configuration
			const config = introductionChannelService.getChannelConfig(guildId);
			expect(config?.channelId).toBe(otherChannelId);
		});

		it("should successfully remove channel configuration", async () => {
			// First configure a channel
			await configureIntroductionChannel({
				guildId,
				channelId,
				configuredBy: adminUserId,
			});

			// Then remove it
			const result = await removeIntroductionChannel({ guildId });

			expect(result.success).toBe(true);
			expect(result.wasConfigured).toBe(true);
			expect(result.removedChannelId).toBe(channelId);

			// Verify configuration is removed
			const config = introductionChannelService.getChannelConfig(guildId);
			expect(config).toBeNull();
		});

		it("should handle removing non-existent configuration", async () => {
			const result = await removeIntroductionChannel({ guildId });

			expect(result.success).toBe(true);
			expect(result.wasConfigured).toBe(false);
			expect(result.removedChannelId).toBeUndefined();
		});
	});

	describe("Post Bonus Awards", () => {
		beforeEach(async () => {
			// Configure introduction channel
			await configureIntroductionChannel({
				guildId,
				channelId,
				configuredBy: adminUserId,
			});
		});

		it("should award 5 RP for original post in introduction channel", async () => {
			const user = createTestUser("user_123", {
				username: "alice",
				displayName: "Alice",
			});
			const messageId = generateMessageId();

			const result = await awardIntroductionBonus({
				guildId,
				channelId,
				user,
				messageId,
				isReply: false,
			});

			expect(result.success).toBe(true);
			expect(result.awarded).toBe(true);
			expect(result.points).toBe(5);
			expect(result.bonusType).toBe("post");
			expect(result.reason).toBe("Awarded 5 RP for introduction post");

			// Verify reputation is persisted
			const userReputation = reputationService.getUserReputation(guildId, user.id);
			expect(userReputation).toBe(5);
		});

		it("should not award bonus for posts in other channels", async () => {
			const user = createTestUser("user_123");
			const messageId = generateMessageId();

			const result = await awardIntroductionBonus({
				guildId,
				channelId: otherChannelId, // Different channel
				user,
				messageId,
				isReply: false,
			});

			expect(result.success).toBe(true);
			expect(result.awarded).toBe(false);
			expect(result.points).toBe(0);
			expect(result.bonusType).toBe("none");
			expect(result.reason).toBe("Message not in configured introduction channel");

			// No reputation should be awarded
			const userReputation = reputationService.getUserReputation(guildId, user.id);
			expect(userReputation).toBe(0);
		});

		it("should not award bonus to bots", async () => {
			const bot = createTestBot("bot_123", "intro-bot");
			const messageId = generateMessageId();

			const result = await awardIntroductionBonus({
				guildId,
				channelId,
				user: bot,
				messageId,
				isReply: false,
			});

			expect(result.success).toBe(true);
			expect(result.awarded).toBe(false);
			expect(result.points).toBe(0);
			expect(result.bonusType).toBe("none");
			expect(result.reason).toBe("Bots cannot receive introduction bonuses");
		});
	});

	describe("Reply Bonus Awards", () => {
		let originalMessageId: string;

		beforeEach(async () => {
			// Configure introduction channel
			await configureIntroductionChannel({
				guildId,
				channelId,
				configuredBy: adminUserId,
			});

			originalMessageId = generateMessageId();
		});

		it("should award 2 RP for first reply to introduction post", async () => {
			const user = createTestUser("user_456", {
				username: "bob",
				displayName: "Bob",
			});
			const replyMessageId = generateMessageId();

			const result = await awardIntroductionBonus({
				guildId,
				channelId,
				user,
				messageId: replyMessageId,
				isReply: true,
				originalMessageId,
			});

			expect(result.success).toBe(true);
			expect(result.awarded).toBe(true);
			expect(result.points).toBe(2);
			expect(result.bonusType).toBe("reply");
			expect(result.reason).toBe("Awarded 2 RP for greeting a new member");
			expect(result.replyLimitInfo?.repliesUsed).toBe(1);
			expect(result.replyLimitInfo?.remainingReplies).toBe(4);

			// Verify reputation is persisted
			const userReputation = reputationService.getUserReputation(guildId, user.id);
			expect(userReputation).toBe(2);

			// Verify reply is tracked
			const replyHistory = introductionReplyService.getUserReplyHistory(guildId, user.id);
			expect(replyHistory).toHaveLength(1);
			expect(replyHistory[0].originalMessageId).toBe(originalMessageId);
		});

		it("should not award bonus for second reply to same post", async () => {
			const user = createTestUser("user_456");

			// First reply - should succeed
			await awardIntroductionBonus({
				guildId,
				channelId,
				user,
				messageId: generateMessageId(),
				isReply: true,
				originalMessageId,
			});

			// Second reply to same post - should fail
			const result = await awardIntroductionBonus({
				guildId,
				channelId,
				user,
				messageId: generateMessageId(),
				isReply: true,
				originalMessageId,
			});

			expect(result.success).toBe(true);
			expect(result.awarded).toBe(false);
			expect(result.points).toBe(0);
			expect(result.bonusType).toBe("reply");
			expect(result.reason).toBe("Already replied to this introduction post");

			// Should still have only 2 RP from first reply
			const userReputation = reputationService.getUserReputation(guildId, user.id);
			expect(userReputation).toBe(2);
		});

		it("should enforce maximum reply limit (5 replies)", async () => {
			const user = createTestUser("user_456");

			// Use up all 5 reply slots
			for (let i = 0; i < 5; i++) {
				const originalMsg = generateMessageId();
				const result = await awardIntroductionBonus({
					guildId,
					channelId,
					user,
					messageId: generateMessageId(),
					isReply: true,
					originalMessageId: originalMsg,
				});
				expect(result.awarded).toBe(true);
			}

			// 6th reply should be denied
			const result = await awardIntroductionBonus({
				guildId,
				channelId,
				user,
				messageId: generateMessageId(),
				isReply: true,
				originalMessageId: generateMessageId(),
			});

			expect(result.success).toBe(true);
			expect(result.awarded).toBe(false);
			expect(result.points).toBe(0);
			expect(result.reason).toBe("Maximum reply limit reached (5)");
			expect(result.replyLimitInfo?.repliesUsed).toBe(5);
			expect(result.replyLimitInfo?.remainingReplies).toBe(0);

			// Should have exactly 10 RP (5 replies × 2 RP)
			const userReputation = reputationService.getUserReputation(guildId, user.id);
			expect(userReputation).toBe(10);
		});

		it("should allow different users to reply to same post", async () => {
			const user1 = createTestUser("user_1");
			const user2 = createTestUser("user_2");
			const user3 = createTestUser("user_3");

			// All three users reply to same original post
			const results = await Promise.all([
				awardIntroductionBonus({
					guildId,
					channelId,
					user: user1,
					messageId: generateMessageId(),
					isReply: true,
					originalMessageId,
				}),
				awardIntroductionBonus({
					guildId,
					channelId,
					user: user2,
					messageId: generateMessageId(),
					isReply: true,
					originalMessageId,
				}),
				awardIntroductionBonus({
					guildId,
					channelId,
					user: user3,
					messageId: generateMessageId(),
					isReply: true,
					originalMessageId,
				}),
			]);

			// All should succeed
			results.forEach(result => {
				expect(result.success).toBe(true);
				expect(result.awarded).toBe(true);
				expect(result.points).toBe(2);
			});

			// Each user should have 2 RP
			expect(reputationService.getUserReputation(guildId, user1.id)).toBe(2);
			expect(reputationService.getUserReputation(guildId, user2.id)).toBe(2);
			expect(reputationService.getUserReputation(guildId, user3.id)).toBe(2);
		});
	});

	describe("Cross-Guild Isolation", () => {
		it("should track introduction channels separately per guild", async () => {
			const guild2Id = generateGuildId();
			const channel2Id = generateMessageId();

			// Configure different channels for different guilds
			await configureIntroductionChannel({
				guildId,
				channelId,
				configuredBy: adminUserId,
			});

			await configureIntroductionChannel({
				guildId: guild2Id,
				channelId: channel2Id,
				configuredBy: adminUserId,
			});

			const user = createTestUser("user_123");

			// Post in guild1's intro channel
			const result1 = await awardIntroductionBonus({
				guildId,
				channelId,
				user,
				messageId: generateMessageId(),
				isReply: false,
			});

			// Post in guild2's intro channel
			const result2 = await awardIntroductionBonus({
				guildId: guild2Id,
				channelId: channel2Id,
				user,
				messageId: generateMessageId(),
				isReply: false,
			});

			// Both should succeed
			expect(result1.awarded).toBe(true);
			expect(result2.awarded).toBe(true);

			// User should have 5 RP in each guild
			expect(reputationService.getUserReputation(guildId, user.id)).toBe(5);
			expect(reputationService.getUserReputation(guild2Id, user.id)).toBe(5);
		});

		it("should track reply limits separately per guild", async () => {
			const guild2Id = generateGuildId();
			const user = createTestUser("user_123");

			// Configure intro channels for both guilds
			await configureIntroductionChannel({ guildId, channelId, configuredBy: adminUserId });
			await configureIntroductionChannel({ guildId: guild2Id, channelId, configuredBy: adminUserId });

			// Use up all reply slots in guild1
			for (let i = 0; i < 5; i++) {
				await awardIntroductionBonus({
					guildId,
					channelId,
					user,
					messageId: generateMessageId(),
					isReply: true,
					originalMessageId: generateMessageId(),
				});
			}

			// Should still be able to reply in guild2
			const result = await awardIntroductionBonus({
				guildId: guild2Id,
				channelId,
				user,
				messageId: generateMessageId(),
				isReply: true,
				originalMessageId: generateMessageId(),
			});

			expect(result.awarded).toBe(true);
			expect(result.points).toBe(2);
		});
	});

	describe("System Configuration", () => {
		// Note: Testing disabled config requires a separate test file due to module mocking limitations
		// This test verifies the behavior when enabled=true (which is the default mock)
		it("should award bonuses when system is enabled", async () => {
			await configureIntroductionChannel({ guildId, channelId, configuredBy: adminUserId });

			const user = createTestUser("user_123");
			const result = await awardIntroductionBonus({
				guildId,
				channelId,
				user,
				messageId: generateMessageId(),
				isReply: false,
			});

			expect(result.success).toBe(true);
			expect(result.awarded).toBe(true);
			expect(result.points).toBe(5);
			expect(result.reason).toBe("Awarded 5 RP for introduction post");
		});
	});

	describe("Rate Limiting and Self-Reply Prevention", () => {
		beforeEach(async () => {
			// Configure introduction channel for each test
			await configureIntroductionChannel({
				guildId,
				channelId,
				configuredBy: adminUserId,
			});
		});

		it("should not award reply bonus to thread owner in their own thread", async () => {
			const threadOwner = createTestUser("thread_owner_123", {
				username: "threadowner",
				displayName: "Thread Owner",
			});

			const result = await awardIntroductionBonus({
				guildId,
				channelId,
				user: threadOwner,
				messageId: generateMessageId(),
				isReply: true,
				originalMessageId: generateMessageId(),
				threadOwnerId: threadOwner.id, // Same as user.id
			});

			expect(result.success).toBe(true);
			expect(result.awarded).toBe(false);
			expect(result.points).toBe(0);
			expect(result.bonusType).toBe("reply");
			expect(result.reason).toBe("Cannot receive reply bonus in your own introduction thread");

			// User should have no reputation
			const userReputation = reputationService.getUserReputation(guildId, threadOwner.id);
			expect(userReputation).toBe(0);
		});

		it("should allow other users to reply in thread owned by someone else", async () => {
			const threadOwner = createTestUser("thread_owner_123");
			const otherUser = createTestUser("other_user_456", {
				username: "otheruser",
				displayName: "Other User",
			});

			const result = await awardIntroductionBonus({
				guildId,
				channelId,
				user: otherUser,
				messageId: generateMessageId(),
				isReply: true,
				originalMessageId: generateMessageId(),
				threadOwnerId: threadOwner.id, // Different from user.id
			});

			expect(result.success).toBe(true);
			expect(result.awarded).toBe(true);
			expect(result.points).toBe(2);
			expect(result.bonusType).toBe("reply");
			expect(result.reason).toBe("Awarded 2 RP for greeting a new member");

			// User should have 2 RP
			const userReputation = reputationService.getUserReputation(guildId, otherUser.id);
			expect(userReputation).toBe(2);
		});

		it("should only allow one introduction post bonus per user per guild", async () => {
			const user = createTestUser("user_123", {
				username: "testuser",
				displayName: "Test User",
			});

			// First thread starter - should succeed
			const result1 = await awardIntroductionBonus({
				guildId,
				channelId,
				user,
				messageId: generateMessageId(),
				isReply: false,
				isThreadStarter: true,
			});

			expect(result1.success).toBe(true);
			expect(result1.awarded).toBe(true);
			expect(result1.points).toBe(5);
			expect(result1.bonusType).toBe("post");

			// Verify user has 5 RP
			let userReputation = reputationService.getUserReputation(guildId, user.id);
			expect(userReputation).toBe(5);

			// Second thread starter - should fail due to rate limiting
			const result2 = await awardIntroductionBonus({
				guildId,
				channelId,
				user,
				messageId: generateMessageId(),
				isReply: false,
				isThreadStarter: true,
			});

			expect(result2.success).toBe(true);
			expect(result2.awarded).toBe(false);
			expect(result2.points).toBe(0);
			expect(result2.bonusType).toBe("post");
			expect(result2.reason).toBe("You can only receive one introduction post bonus per server");

			// User should still have only 5 RP
			userReputation = reputationService.getUserReputation(guildId, user.id);
			expect(userReputation).toBe(5);
		});

		it("should allow introduction post bonus in different guilds", async () => {
			const user = createTestUser("user_123", {
				username: "testuser",
				displayName: "Test User",
			});
			const guild2Id = generateGuildId();

			// Configure second guild
			await configureIntroductionChannel({
				guildId: guild2Id,
				channelId,
				configuredBy: adminUserId,
			});

			// First guild - should succeed
			const result1 = await awardIntroductionBonus({
				guildId,
				channelId,
				user,
				messageId: generateMessageId(),
				isReply: false,
				isThreadStarter: true,
			});

			expect(result1.success).toBe(true);
			expect(result1.awarded).toBe(true);
			expect(result1.points).toBe(5);

			// Second guild - should also succeed
			const result2 = await awardIntroductionBonus({
				guildId: guild2Id,
				channelId,
				user,
				messageId: generateMessageId(),
				isReply: false,
				isThreadStarter: true,
			});

			expect(result2.success).toBe(true);
			expect(result2.awarded).toBe(true);
			expect(result2.points).toBe(5);

			// User should have 5 RP in each guild
			expect(reputationService.getUserReputation(guildId, user.id)).toBe(5);
			expect(reputationService.getUserReputation(guild2Id, user.id)).toBe(5);
		});
	});
});
