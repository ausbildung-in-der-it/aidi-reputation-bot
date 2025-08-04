import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addReputationForReaction } from "@/core/usecases/addReputationForReaction";
import { reputationService } from "@/core/services/reputationService";
import { handleReputationCommand } from "@/bot/commands/reputation";
import { handleLeaderboardCommand } from "@/bot/commands/leaderboard";
import { db } from "@/db/sqlite";
import { createTestUser, generateGuildId, generateMessageId } from "../setup/testUtils";

// Mock Discord interactions
const createReputationMockInteraction = (userId: string, guildId: string, targetUserId?: string) => ({
	guild: { id: guildId, name: `Guild ${guildId}` },
	user: {
		id: userId,
		username: `user_${userId}`,
		displayName: `User ${userId}`,
		displayAvatarURL: () => "https://example.com/avatar.png",
	},
	options: {
		getUser: (_name: string) =>
			targetUserId
				? {
						id: targetUserId,
						username: `user_${targetUserId}`,
						displayName: `User ${targetUserId}`,
						displayAvatarURL: () => "https://example.com/avatar.png",
					}
				: null,
	},
	reply: vi.fn(),
});

const createLeaderboardMockInteraction = (userId: string, guildId: string, guildName: string, limit?: number) => ({
	guild: { id: guildId, name: guildName },
	user: { id: userId },
	options: {
		getInteger: (name: string) => (name === "limit" ? limit : null),
	},
	reply: vi.fn(),
	deferReply: vi.fn(),
	editReply: vi.fn(),
	replied: false,
	deferred: true, // Mock the deferred state for safeReply logic
});

// Mock embed functions
vi.mock("@/bot/utils/embeds", () => ({
	createReputationEmbed: (user: any, reputation: number) => ({
		data: {
			title: "🏆 Reputation",
			fields: [
				{ name: "User", value: `${user.displayName} (${user.username})`, inline: true },
				{ name: "Reputation Punkte", value: reputation.toString(), inline: true },
			],
		},
	}),
	createLeaderboardEmbed: (leaderboard: any[], guildName: string) => ({
		data: {
			title: "🏆 Reputation Leaderboard",
			description: `Top ${leaderboard.length} User in ${guildName}`,
			fields:
				leaderboard.length === 0
					? [
							{
								name: "Keine Daten",
								value: "Es wurden noch keine Reputation Punkte vergeben.",
								inline: false,
							},
						]
					: [
							{
								name: "Rankings",
								value: leaderboard
									.map((entry, index) => {
										const medal =
											index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🏅";
										return `${medal} **${index + 1}.** <@${entry.to_user_id}> - **${entry.total}** Punkte`;
									})
									.join("\n"),
								inline: false,
							},
						],
		},
	}),
}));

// Mock config
vi.mock("@/config/reputation", () => ({
	REPUTATION_EMOJIS: [{ emoji: "🏆", points: 1 }],
	RATE_LIMIT_CONFIG: {
		dailyLimit: 5,
		perRecipientLimit: 1,
		windowHours: 24,
	},
	getEmojiPoints: (emoji: string) => (emoji === "🏆" ? 1 : null),
	isValidReputationEmoji: (emoji: string) => emoji === "🏆",
}));

describe("Cross-Guild Isolation", () => {
	let guild1Id: string;
	let guild2Id: string;
	let _guild3Id: string;

	beforeEach(async () => {
		// Clean up test database for each test
		db.exec("DELETE FROM reputation_events");
		db.exec("DELETE FROM reputation_rate_limits");

		guild1Id = generateGuildId();
		guild2Id = generateGuildId();
		_guild3Id = generateGuildId();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Reputation award isolation", () => {
		it("should track reputation separately per guild", async () => {
			const alice = createTestUser("alice_123");
			const bob = createTestUser("bob_456");

			// Alice gets reputation in Guild 1
			const result1 = await addReputationForReaction({
				guildId: guild1Id,
				messageId: generateMessageId(),
				recipient: alice,
				reactor: bob,
				emoji: "🏆",
			});

			// Alice gets reputation in Guild 2
			const result2 = await addReputationForReaction({
				guildId: guild2Id,
				messageId: generateMessageId(),
				recipient: alice,
				reactor: bob,
				emoji: "🏆",
			});

			expect(result1.success).toBe(true);
			expect(result2.success).toBe(true);

			// Check reputation in each guild separately
			const guild1Reputation = reputationService.getUserReputation(guild1Id, alice.id);
			const guild2Reputation = reputationService.getUserReputation(guild2Id, alice.id);

			expect(guild1Reputation).toBe(1);
			expect(guild2Reputation).toBe(1);
		});

		it("should isolate rate limiting per guild", async () => {
			const alice = createTestUser("alice_123");
			const bob = createTestUser("bob_456");

			// Bob gives reputation to Alice in Guild 1
			const result1 = await addReputationForReaction({
				guildId: guild1Id,
				messageId: generateMessageId(),
				recipient: alice,
				reactor: bob,
				emoji: "🏆",
			});

			// Bob should be able to give reputation to Alice again in Guild 2 (different guild)
			const result2 = await addReputationForReaction({
				guildId: guild2Id,
				messageId: generateMessageId(),
				recipient: alice,
				reactor: bob,
				emoji: "🏆",
			});

			expect(result1.success).toBe(true);
			expect(result2.success).toBe(true);

			// But Bob should NOT be able to give Alice reputation again in Guild 1 (per-recipient limit)
			const result3 = await addReputationForReaction({
				guildId: guild1Id,
				messageId: generateMessageId(),
				recipient: alice,
				reactor: bob,
				emoji: "🏆",
			});

			expect(result3.success).toBe(false);
		});

		it("should allow same user to have different daily limits per guild", async () => {
			const alice = createTestUser("alice_123");
			const targets = Array.from({ length: 10 }, (_, i) => createTestUser(`target_${i}`));

			// Alice gives 5 awards in Guild 1 (reaching daily limit)
			const guild1Results = [];
			for (let i = 0; i < 5; i++) {
				const result = await addReputationForReaction({
					guildId: guild1Id,
					messageId: generateMessageId(),
					recipient: targets[i],
					reactor: alice,
					emoji: "🏆",
				});
				guild1Results.push(result);
			}

			// All 5 should succeed
			guild1Results.forEach(result => expect(result.success).toBe(true));

			// 6th award in Guild 1 should fail (daily limit)
			const guild1FailResult = await addReputationForReaction({
				guildId: guild1Id,
				messageId: generateMessageId(),
				recipient: targets[5],
				reactor: alice,
				emoji: "🏆",
			});

			expect(guild1FailResult.success).toBe(false);

			// But Alice should still be able to give awards in Guild 2 (fresh daily limit)
			const guild2Results = [];
			for (let i = 0; i < 5; i++) {
				const result = await addReputationForReaction({
					guildId: guild2Id,
					messageId: generateMessageId(),
					recipient: targets[i],
					reactor: alice,
					emoji: "🏆",
				});
				guild2Results.push(result);
			}

			// All Guild 2 awards should succeed
			guild2Results.forEach(result => expect(result.success).toBe(true));
		});
	});

	describe("Reputation command isolation", () => {
		it("should show different reputation values per guild", async () => {
			const alice = createTestUser("alice_123");
			const checkingUser = createTestUser("checker_456");

			// Setup: Alice gets different amounts of reputation in each guild
			// Guild 1: 3 points
			for (let i = 0; i < 3; i++) {
				reputationService.trackReputationReaction({
					guildId: guild1Id,
					messageId: generateMessageId(),
					toUserId: alice.id,
					fromUserId: `reactor_g1_${i}`,
					emoji: "🏆",
					amount: 1,
				});
			}

			// Guild 2: 7 points
			for (let i = 0; i < 7; i++) {
				reputationService.trackReputationReaction({
					guildId: guild2Id,
					messageId: generateMessageId(),
					toUserId: alice.id,
					fromUserId: `reactor_g2_${i}`,
					emoji: "🏆",
					amount: 1,
				});
			}

			// Check Alice's reputation in Guild 1
			const guild1Interaction = createReputationMockInteraction(checkingUser.id, guild1Id, alice.id);
			await handleReputationCommand(guild1Interaction as any);

			expect(guild1Interaction.reply).toHaveBeenCalledWith({
				embeds: [
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: expect.stringContaining("Reputation"),
									value: "3",
								}),
							]),
						}),
					}),
				],
			});

			// Check Alice's reputation in Guild 2
			const guild2Interaction = createReputationMockInteraction(checkingUser.id, guild2Id, alice.id);
			await handleReputationCommand(guild2Interaction as any);

			expect(guild2Interaction.reply).toHaveBeenCalledWith({
				embeds: [
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: expect.stringContaining("Reputation"),
									value: "7",
								}),
							]),
						}),
					}),
				],
			});
		});
	});

	describe("Leaderboard isolation", () => {
		it("should show completely different leaderboards per guild", async () => {
			const checkingUser = createTestUser("checker_123");

			// Setup Guild 1 leaderboard
			const guild1Users = [
				{ id: "g1_alice", points: 5 },
				{ id: "g1_bob", points: 3 },
			];

			guild1Users.forEach((user, userIndex) => {
				for (let i = 0; i < user.points; i++) {
					reputationService.trackReputationReaction({
						guildId: guild1Id,
						messageId: generateMessageId(),
						toUserId: user.id,
						fromUserId: `g1_reactor_${userIndex}_${i}`,
						emoji: "🏆",
						amount: 1,
					});
				}
			});

			// Setup Guild 2 leaderboard (different users, different scores)
			const guild2Users = [
				{ id: "g2_charlie", points: 10 },
				{ id: "g2_diana", points: 2 },
			];

			guild2Users.forEach((user, userIndex) => {
				for (let i = 0; i < user.points; i++) {
					reputationService.trackReputationReaction({
						guildId: guild2Id,
						messageId: generateMessageId(),
						toUserId: user.id,
						fromUserId: `g2_reactor_${userIndex}_${i}`,
						emoji: "🏆",
						amount: 1,
					});
				}
			});

			// Check Guild 1 leaderboard
			const guild1Interaction = createLeaderboardMockInteraction(checkingUser.id, guild1Id, "Guild 1");
			await handleLeaderboardCommand(guild1Interaction as any);

			const guild1Call = guild1Interaction.editReply.mock.calls[0][0];
			const guild1Rankings = guild1Call.embeds[0].data.fields[0].value;

			expect(guild1Rankings).toContain("g1_alice");
			expect(guild1Rankings).toContain("g1_bob");
			expect(guild1Rankings).not.toContain("g2_charlie");
			expect(guild1Rankings).not.toContain("g2_diana");

			// Check Guild 2 leaderboard
			const guild2Interaction = createLeaderboardMockInteraction(checkingUser.id, guild2Id, "Guild 2");
			await handleLeaderboardCommand(guild2Interaction as any);

			const guild2Call = guild2Interaction.editReply.mock.calls[0][0];
			const guild2Rankings = guild2Call.embeds[0].data.fields[0].value;

			expect(guild2Rankings).toContain("g2_charlie");
			expect(guild2Rankings).toContain("g2_diana");
			expect(guild2Rankings).not.toContain("g1_alice");
			expect(guild2Rankings).not.toContain("g1_bob");
		});

		it("should handle same user IDs across different guilds", async () => {
			const checkingUser = createTestUser("checker_123");
			const sameUserId = "shared_user_456";

			// Same user ID gets different reputation in different guilds
			reputationService.trackReputationReaction({
				guildId: guild1Id,
				messageId: generateMessageId(),
				toUserId: sameUserId,
				fromUserId: "reactor1",
				emoji: "🏆",
				amount: 1,
			});

			for (let i = 0; i < 3; i++) {
				reputationService.trackReputationReaction({
					guildId: guild2Id,
					messageId: generateMessageId(),
					toUserId: sameUserId,
					fromUserId: `reactor2_${i}`,
					emoji: "🏆",
					amount: 1,
				});
			}

			// Guild 1 leaderboard should show user with 1 point
			const guild1Interaction = createLeaderboardMockInteraction(checkingUser.id, guild1Id, "Guild 1");
			await handleLeaderboardCommand(guild1Interaction as any);

			const guild1Call = guild1Interaction.editReply.mock.calls[0][0];
			const guild1Rankings = guild1Call.embeds[0].data.fields[0].value;
			expect(guild1Rankings).toContain(`<@${sameUserId}> - **1** Punkte`);

			// Guild 2 leaderboard should show same user with 3 points
			const guild2Interaction = createLeaderboardMockInteraction(checkingUser.id, guild2Id, "Guild 2");
			await handleLeaderboardCommand(guild2Interaction as any);

			const guild2Call = guild2Interaction.editReply.mock.calls[0][0];
			const guild2Rankings = guild2Call.embeds[0].data.fields[0].value;
			expect(guild2Rankings).toContain(`<@${sameUserId}> - **3** Punkte`);
		});
	});

	describe("Complete isolation workflow", () => {
		it("should demonstrate complete independence across guilds", async () => {
			const alice = createTestUser("alice_123");
			const bob = createTestUser("bob_456");
			const charlie = createTestUser("charlie_789");

			// Complete workflow in Guild 1:
			// 1. Alice gives Bob reputation
			const award1 = await addReputationForReaction({
				guildId: guild1Id,
				messageId: generateMessageId(),
				recipient: bob,
				reactor: alice,
				emoji: "🏆",
			});
			expect(award1.success).toBe(true);

			// 2. Charlie gives Bob reputation
			const award2 = await addReputationForReaction({
				guildId: guild1Id,
				messageId: generateMessageId(),
				recipient: bob,
				reactor: charlie,
				emoji: "🏆",
			});
			expect(award2.success).toBe(true);

			// 3. Alice tries to give Bob reputation again (should fail - per-recipient limit)
			const award3 = await addReputationForReaction({
				guildId: guild1Id,
				messageId: generateMessageId(),
				recipient: bob,
				reactor: alice,
				emoji: "🏆",
			});
			expect(award3.success).toBe(false);

			// Complete workflow in Guild 2 (same users, fresh start):
			// 1. Alice gives Bob reputation (should work - different guild)
			const award4 = await addReputationForReaction({
				guildId: guild2Id,
				messageId: generateMessageId(),
				recipient: bob,
				reactor: alice,
				emoji: "🏆",
			});
			expect(award4.success).toBe(true);

			// Final state verification:
			// Bob should have 2 points in Guild 1, 1 point in Guild 2
			expect(reputationService.getUserReputation(guild1Id, bob.id)).toBe(2);
			expect(reputationService.getUserReputation(guild2Id, bob.id)).toBe(1);

			// Alice should be able to give more awards in Guild 2
			const award5 = await addReputationForReaction({
				guildId: guild2Id,
				messageId: generateMessageId(),
				recipient: charlie,
				reactor: alice,
				emoji: "🏆",
			});
			expect(award5.success).toBe(true);
		});
	});
});
