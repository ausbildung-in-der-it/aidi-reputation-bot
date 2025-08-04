import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MessageFlags } from "discord.js";
import { handleReputationCommand } from "@/bot/commands/reputation";
import { reputationService } from "@/core/services/reputationService";
import { db } from "@/db/sqlite";
import { generateGuildId, generateUserId } from "../setup/testUtils";

// Mock Discord.js interaction
const createMockInteraction = (userId: string, guildId: string, targetUserId?: string) => ({
	guild: { id: guildId, name: "Test Guild" },
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
	replied: false,
	deferred: false,
});

// Mock the embed creation function
vi.mock("@/bot/utils/embeds", () => ({
	createReputationEmbed: (user: any, reputation: number) => ({
		data: {
			title: "🏆 Reputation",
			fields: [
				{
					name: "User",
					value: `${user.displayName} (${user.username})`,
					inline: true,
				},
				{
					name: "Reputation Punkte",
					value: reputation.toString(),
					inline: true,
				},
			],
		},
	}),
}));

// Mock only config for test reliability
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

describe("User Checks Reputation", () => {
	let guildId: string;

	beforeEach(async () => {
		// Clean up test database for each test
		db.exec("DELETE FROM reputation_events");
		db.exec("DELETE FROM reputation_rate_limits");
		guildId = generateGuildId();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("User checks own reputation", () => {
		it("should show 0 reputation for new user", async () => {
			const userId = generateUserId();
			const mockInteraction = createMockInteraction(userId, guildId);

			await handleReputationCommand(mockInteraction as any);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: [
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: expect.stringContaining("Reputation"),
									value: "0",
								}),
							]),
						}),
					}),
				],
			});
		});

		it("should show correct reputation after receiving awards", async () => {
			const userId = generateUserId();

			// Setup: Give user some reputation points
			reputationService.trackReputationReaction({
				guildId,
				messageId: "msg1",
				toUserId: userId,
				fromUserId: "reactor1",
				emoji: "🏆",
				amount: 1,
			});

			reputationService.trackReputationReaction({
				guildId,
				messageId: "msg2",
				toUserId: userId,
				fromUserId: "reactor2",
				emoji: "🏆",
				amount: 1,
			});

			const mockInteraction = createMockInteraction(userId, guildId);

			await handleReputationCommand(mockInteraction as any);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: [
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: expect.stringContaining("Reputation"),
									value: "2",
								}),
							]),
						}),
					}),
				],
			});
		});
	});

	describe("User checks another user's reputation", () => {
		it("should show other user's reputation correctly", async () => {
			const checkingUserId = generateUserId();
			const targetUserId = generateUserId();

			// Setup: Give target user reputation
			reputationService.trackReputationReaction({
				guildId,
				messageId: "msg1",
				toUserId: targetUserId,
				fromUserId: "reactor1",
				emoji: "🏆",
				amount: 1,
			});

			const mockInteraction = createMockInteraction(checkingUserId, guildId, targetUserId);

			await handleReputationCommand(mockInteraction as any);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: [
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: expect.stringContaining("Reputation"),
									value: "1",
								}),
							]),
						}),
					}),
				],
			});
		});

		it("should show 0 for user with no reputation", async () => {
			const checkingUserId = generateUserId();
			const targetUserId = generateUserId();

			const mockInteraction = createMockInteraction(checkingUserId, guildId, targetUserId);

			await handleReputationCommand(mockInteraction as any);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: [
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: expect.stringContaining("Reputation"),
									value: "0",
								}),
							]),
						}),
					}),
				],
			});
		});
	});

	describe("Guild isolation", () => {
		it("should only show reputation from current guild", async () => {
			const userId = generateUserId();
			const guild1Id = generateGuildId();
			const guild2Id = generateGuildId();

			// Setup: Give user reputation in both guilds
			reputationService.trackReputationReaction({
				guildId: guild1Id,
				messageId: "msg1",
				toUserId: userId,
				fromUserId: "reactor1",
				emoji: "🏆",
				amount: 1,
			});

			reputationService.trackReputationReaction({
				guildId: guild2Id,
				messageId: "msg2",
				toUserId: userId,
				fromUserId: "reactor2",
				emoji: "🏆",
				amount: 1,
			});

			// Check reputation in guild1 - should only show guild1 reputation
			const mockInteraction1 = createMockInteraction(userId, guild1Id);
			await handleReputationCommand(mockInteraction1 as any);

			expect(mockInteraction1.reply).toHaveBeenCalledWith({
				embeds: [
					expect.objectContaining({
						data: expect.objectContaining({
							fields: expect.arrayContaining([
								expect.objectContaining({
									name: expect.stringContaining("Reputation"),
									value: "1", // Only guild1 reputation
								}),
							]),
						}),
					}),
				],
			});
		});
	});

	describe("Error handling", () => {
		it("should handle guild-only enforcement", async () => {
			const userId = generateUserId();
			const mockInteraction = {
				guild: null, // No guild context
				user: { id: userId },
				options: { getUser: () => null },
				reply: vi.fn(),
			};

			await handleReputationCommand(mockInteraction as any);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: "Dieser Command kann nur in einem Server verwendet werden.",
				flags: MessageFlags.Ephemeral,
			});
		});
	});
});
