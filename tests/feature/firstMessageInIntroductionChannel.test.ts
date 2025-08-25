import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { onMessageCreate } from "@/bot/events/onMessageCreate";
import { reputationService } from "@/core/services/reputationService";
import { dailyBonusService } from "@/core/services/dailyBonusService";
import { configureIntroductionChannel } from "@/core/usecases/configureIntroductionChannel";
import { db } from "@/db/sqlite";
import { createTestUser, generateGuildId, generateMessageId } from "../setup/testUtils";

// Mock config for reliable tests
vi.mock("@/config/reputation", () => ({
    DAILY_BONUS_CONFIG: {
        enabled: true,
        points: 1,
        timezone: "Europe/Berlin",
    },
    INTRODUCTION_CONFIG: {
        enabled: true,
        postBonus: 2,
        replyBonus: 1,
        maxRepliesPerUser: 5,
        replyWindowHours: 24,
    },
    getCurrentDateInTimezone: (_timezone: string) => "2024-01-15", // Fixed test date
}));

// Mock Discord notification service to prevent errors
vi.mock("@/bot/services/discordNotificationService", () => ({
    getDiscordNotificationService: () => null, // Disable notifications for tests
}));

// Mock Discord role service
vi.mock("@/bot/services/discordRoleService", () => ({
    discordRoleService: {
        updateUserRank: vi.fn().mockResolvedValue({ success: false, updated: false }),
    },
}));

describe("First Message in Introduction Channel - Issue #1", () => {
    let guildId: string;
    let introductionChannelId: string;
    let threadId: string;
    let messageId: string;
    let user: any;

    beforeEach(async () => {
        // Clean up test database
        db.exec("DELETE FROM reputation_events");
        db.exec("DELETE FROM daily_bonus_tracking");
        db.exec("DELETE FROM introduction_channel_config");
        db.exec("DELETE FROM introduction_reply_tracking");

        guildId = generateGuildId();
        introductionChannelId = generateMessageId();
        threadId = generateMessageId();
        messageId = generateMessageId();
        user = createTestUser("user_123", {
            username: "TestUser",
            displayName: "TestUser",
        });

        // Configure introduction channel
        await configureIntroductionChannel({
            guildId,
            channelId: introductionChannelId,
            configuredBy: "admin_123",
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // Mock Discord Message for forum thread starter
    const createIntroductionMessage = (overrides = {}) => ({
        partial: false,
        guild: {
            id: guildId,
            members: {
                fetch: vi.fn().mockResolvedValue({
                    user: {
                        id: user.id,
                        bot: false,
                        system: false,
                        username: user.username,
                        displayName: user.displayName,
                    },
                }),
            },
        },
        author: {
            id: user.id,
            bot: false,
            system: false,
            username: user.username,
        },
        id: messageId,
        system: false,
        type: 0, // MessageType.Default
        createdAt: new Date(),
        createdTimestamp: Date.now(),
        reference: null, // No message reference for thread starter
        channel: {
            id: threadId,
            type: 11, // Forum thread channel type
            parent: {
                id: introductionChannelId, // Parent is the forum channel
            },
            ownerId: user.id, // User owns the thread
            createdTimestamp: Date.now(), // Same time as message for thread starter
            name: "User Introduction",
        },
        fetch: vi.fn(),
        ...overrides,
    });

    describe("Issue #1: Missing Introduction Bonus", () => {
        it("should award BOTH daily bonus (1 RP) AND introduction bonus (2 RP) for first message in introduction channel", async () => {
            // GIVEN: User has never received any bonuses
            const initialRP = reputationService.getUserReputation(guildId, user.id);
            expect(initialRP).toBe(0);

            const dailyCheck = dailyBonusService.checkDailyBonus(guildId, user.id);
            expect(dailyCheck.canReceive).toBe(true);

            // WHEN: User posts their first message in introduction channel (thread starter)
            const message = createIntroductionMessage();
            await onMessageCreate(message);

            // THEN: User should receive BOTH bonuses (3 RP total)
            const finalRP = reputationService.getUserReputation(guildId, user.id);
            
            // This test now PASSES - documents fix for issue #1
            expect(finalRP).toBe(3); // 1 (daily) + 2 (introduction) = 3 total
            
            // Verify both bonus events exist in database
            const events = db
                .prepare("SELECT emoji, amount FROM reputation_events WHERE guild_id = ? AND to_user_id = ?")
                .all(guildId, user.id) as { emoji: string; amount: number }[];
            
            expect(events).toHaveLength(2);
            expect(events).toContainEqual({ emoji: "daily_bonus", amount: 1n });
            expect(events).toContainEqual({ emoji: "forum_post", amount: 2n });

            // Verify daily bonus was tracked
            const dailyCheckAfter = dailyBonusService.checkDailyBonus(guildId, user.id);
            expect(dailyCheckAfter.canReceive).toBe(false);
            expect(dailyCheckAfter.alreadyReceived).toBe(true);
        });

        it("should work correctly for subsequent messages (only daily bonus)", async () => {
            // GIVEN: User already got introduction bonus on previous day
            reputationService.trackReputationReaction({
                guildId,
                messageId: "previous_message",
                toUserId: user.id,
                fromUserId: "system",
                emoji: "forum_post",
                amount: 2,
            });

            const initialRP = reputationService.getUserReputation(guildId, user.id);
            expect(initialRP).toBe(2);

            // WHEN: User posts another message next day
            const message = createIntroductionMessage({
                id: generateMessageId(),
            });
            await onMessageCreate(message);

            // THEN: User should only receive daily bonus (1 RP)
            const finalRP = reputationService.getUserReputation(guildId, user.id);
            expect(finalRP).toBe(3); // 2 (previous) + 1 (daily only)

            // Verify only daily bonus event was added
            const newEvents = db
                .prepare("SELECT emoji, amount FROM reputation_events WHERE guild_id = ? AND to_user_id = ? AND message_id = ?")
                .all(guildId, user.id, message.id) as { emoji: string; amount: number }[];
            
            expect(newEvents).toHaveLength(1);
            expect(newEvents).toContainEqual({ emoji: "daily_bonus", amount: 1n });
        });

        it("should handle introduction reply correctly (2 RP intro reply + 1 RP daily)", async () => {
            // GIVEN: Another user created introduction thread
            const threadOwnerId = "thread_owner_123";
            reputationService.trackReputationReaction({
                guildId,
                messageId: "owner_message",
                toUserId: threadOwnerId,
                fromUserId: "system", 
                emoji: "forum_post",
                amount: 2,
            });

            // WHEN: Our test user replies to that thread (first time today)
            const replyMessage = createIntroductionMessage({
                id: generateMessageId(),
                channel: {
                    ...createIntroductionMessage().channel,
                    ownerId: threadOwnerId, // Different user owns the thread
                    createdTimestamp: Date.now() - 60000, // Thread created earlier
                },
                createdTimestamp: Date.now(), // Reply is newer
            });
            
            await onMessageCreate(replyMessage);

            // THEN: User should receive introduction reply bonus (1 RP) + daily bonus (1 RP)
            const finalRP = reputationService.getUserReputation(guildId, user.id);
            expect(finalRP).toBe(2); // 1 (intro reply) + 1 (daily) = 2 total

            // Verify both bonus events exist
            const events = db
                .prepare("SELECT emoji, amount FROM reputation_events WHERE guild_id = ? AND to_user_id = ?")
                .all(guildId, user.id) as { emoji: string; amount: number }[];
            
            expect(events).toHaveLength(2);
            expect(events).toContainEqual({ emoji: "daily_bonus", amount: 1n });
            expect(events).toContainEqual({ emoji: "introduction_reply", amount: 1n });
        });
    });

    describe("Regression Tests", () => {
        it("should still work for daily bonus only (non-introduction channel)", async () => {
            // GIVEN: Message in regular channel (not introduction)
            const regularMessage = createIntroductionMessage({
                channel: {
                    id: threadId,
                    type: 11,
                    parent: {
                        id: "some_other_channel", // Not the introduction channel
                    },
                    ownerId: user.id,
                    createdTimestamp: Date.now(),
                    name: "Regular Thread",
                },
            });

            // WHEN: User posts message
            await onMessageCreate(regularMessage);

            // THEN: Only daily bonus should be awarded
            const finalRP = reputationService.getUserReputation(guildId, user.id);
            expect(finalRP).toBe(1); // Only daily bonus

            const events = db
                .prepare("SELECT emoji, amount FROM reputation_events WHERE guild_id = ? AND to_user_id = ?")
                .all(guildId, user.id) as { emoji: string; amount: number }[];
            
            expect(events).toHaveLength(1);
            expect(events).toContainEqual({ emoji: "daily_bonus", amount: 1n });
        });
    });
});