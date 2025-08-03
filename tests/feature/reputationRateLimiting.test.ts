import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { addReputationForReaction } from "@/core/usecases/addReputationForReaction";
import { ReputationValidationError } from "@/core/types/UserInfo";
import { createTestDatabase, cleanupTestDatabase } from "../setup/testDb";
import { createTestUser, createTestBot, generateGuildId, generateMessageId, generateUserId } from "../setup/testUtils";

// Mock the database module
vi.mock("@/db/sqlite", () => {
	let mockDb: Database.Database;
	return {
		get db() {
			return mockDb;
		},
		setMockDb: (db: Database.Database) => {
			mockDb = db;
		},
	};
});

// Mock the config to speed up tests
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

describe("Reputation Rate Limiting Feature", () => {
	let testDb: Database.Database;
	let guildId: string;
	let messageId: string;
	let reactor: ReturnType<typeof createTestUser>;
	let recipient: ReturnType<typeof createTestUser>;

	beforeEach(async () => {
		testDb = createTestDatabase();
		// Set the mock database
		const { setMockDb } = await import("@/db/sqlite");
		setMockDb(testDb);

		// Create test data
		guildId = generateGuildId();
		messageId = generateMessageId();
		reactor = createTestUser(generateUserId());
		recipient = createTestUser(generateUserId());
	});

	afterEach(() => {
		if (testDb) {
			cleanupTestDatabase(testDb);
			testDb.close();
		}
	});

	describe("Basic Reputation Award", () => {
		it("should successfully award reputation for valid input", async () => {
			const result = await addReputationForReaction({
				guildId,
				messageId,
				recipient,
				reactor,
				emoji: "🏆",
			});

			expect(result.success).toBe(true);
			expect(result.points).toBe(1);
			expect(result.newTotal).toBe(1);
			expect(result.recipient?.id).toBe(recipient.id);
			expect(result.reactor?.id).toBe(reactor.id);
		});

		it("should reject self-awards", async () => {
			const user = createTestUser(generateUserId());

			const result = await addReputationForReaction({
				guildId,
				messageId,
				recipient: user,
				reactor: user, // Same user
				emoji: "🏆",
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe(ReputationValidationError.SELF_AWARD);
		});

		it("should reject awards to bots", async () => {
			const bot = createTestBot(generateUserId());

			const result = await addReputationForReaction({
				guildId,
				messageId,
				recipient: bot,
				reactor,
				emoji: "🏆",
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe(ReputationValidationError.BOT_RECIPIENT);
		});

		it("should reject unsupported emojis", async () => {
			const result = await addReputationForReaction({
				guildId,
				messageId,
				recipient,
				reactor,
				emoji: "❌", // Unsupported emoji
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe(ReputationValidationError.UNSUPPORTED_EMOJI);
		});
	});

	describe("Daily Rate Limiting", () => {
		it("should allow up to 5 awards per day", async () => {
			// Create 5 different recipients
			const recipients = Array.from({ length: 5 }, () => createTestUser(generateUserId()));

			// Award reputation to each recipient
			for (const recip of recipients) {
				const result = await addReputationForReaction({
					guildId,
					messageId: generateMessageId(),
					recipient: recip,
					reactor,
					emoji: "🏆",
				});

				expect(result.success).toBe(true);
			}
		});

		it("should reject 6th award on the same day", async () => {
			// Create 6 different recipients
			const recipients = Array.from({ length: 6 }, () => createTestUser(generateUserId()));

			// Award reputation to first 5 recipients (should succeed)
			for (let i = 0; i < 5; i++) {
				const result = await addReputationForReaction({
					guildId,
					messageId: generateMessageId(),
					recipient: recipients[i],
					reactor,
					emoji: "🏆",
				});
				expect(result.success).toBe(true);
			}

			// 6th award should fail
			const result = await addReputationForReaction({
				guildId,
				messageId: generateMessageId(),
				recipient: recipients[5],
				reactor,
				emoji: "🏆",
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe(ReputationValidationError.DAILY_LIMIT_EXCEEDED);
		});
	});

	describe("Per-Recipient Rate Limiting", () => {
		it("should allow only 1 award per recipient per day", async () => {
			// First award should succeed
			const result1 = await addReputationForReaction({
				guildId,
				messageId: generateMessageId(),
				recipient,
				reactor,
				emoji: "🏆",
			});

			expect(result1.success).toBe(true);

			// Second award to same recipient should fail
			const result2 = await addReputationForReaction({
				guildId,
				messageId: generateMessageId(),
				recipient,
				reactor,
				emoji: "🏆",
			});

			expect(result2.success).toBe(false);
			expect(result2.error).toBe(ReputationValidationError.RECIPIENT_LIMIT_EXCEEDED);
		});

		it("should track per-recipient limits independently", async () => {
			const recipient1 = createTestUser(generateUserId());
			const recipient2 = createTestUser(generateUserId());

			// Award to recipient1
			const result1 = await addReputationForReaction({
				guildId,
				messageId: generateMessageId(),
				recipient: recipient1,
				reactor,
				emoji: "🏆",
			});
			expect(result1.success).toBe(true);

			// Award to recipient2 should still work
			const result2 = await addReputationForReaction({
				guildId,
				messageId: generateMessageId(),
				recipient: recipient2,
				reactor,
				emoji: "🏆",
			});
			expect(result2.success).toBe(true);

			// Second award to recipient1 should fail
			const result3 = await addReputationForReaction({
				guildId,
				messageId: generateMessageId(),
				recipient: recipient1,
				reactor,
				emoji: "🏆",
			});
			expect(result3.success).toBe(false);
			expect(result3.error).toBe(ReputationValidationError.RECIPIENT_LIMIT_EXCEEDED);
		});
	});

	describe("Combined Rate Limiting", () => {
		it("should enforce both daily and per-recipient limits", async () => {
			const recipients = Array.from({ length: 6 }, () => createTestUser(generateUserId()));

			// Award to first 5 different recipients (uses up daily limit)
			for (let i = 0; i < 5; i++) {
				const result = await addReputationForReaction({
					guildId,
					messageId: generateMessageId(),
					recipient: recipients[i],
					reactor,
					emoji: "🏆",
				});
				expect(result.success).toBe(true);
			}

			// Try to award to 6th recipient (should fail due to daily limit)
			const result = await addReputationForReaction({
				guildId,
				messageId: generateMessageId(),
				recipient: recipients[5],
				reactor,
				emoji: "🏆",
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe(ReputationValidationError.DAILY_LIMIT_EXCEEDED);
		});
	});

	describe("Guild Isolation", () => {
		it("should track limits per guild independently", async () => {
			const guild1Id = generateGuildId();
			const guild2Id = generateGuildId();

			// Award in guild1
			const result1 = await addReputationForReaction({
				guildId: guild1Id,
				messageId: generateMessageId(),
				recipient,
				reactor,
				emoji: "🏆",
			});
			expect(result1.success).toBe(true);

			// Award to same recipient in guild2 should work
			const result2 = await addReputationForReaction({
				guildId: guild2Id,
				messageId: generateMessageId(),
				recipient,
				reactor,
				emoji: "🏆",
			});
			expect(result2.success).toBe(true);
		});
	});
});
