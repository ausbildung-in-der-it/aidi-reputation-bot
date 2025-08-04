import { describe, beforeEach, it, expect, vi } from "vitest";
import { awardDailyBonus } from "@/core/usecases/awardDailyBonus";
import { generateGuildId } from "../setup/testUtils";
import { db } from "@/db/sqlite";

// Mock awardDailyBonus to track if it gets called
vi.mock("@/core/usecases/awardDailyBonus", () => ({
	awardDailyBonus: vi.fn(),
}));

// Mock Discord Message objects
const createMockMessage = (overrides = {} as any) => ({
	partial: false,
	guild: { 
		id: "test_guild_123",
		members: {
			fetch: vi.fn().mockResolvedValue({
				user: { 
					id: "test_user_123", 
					bot: false, 
					system: false, 
					username: "TestUser",
					displayName: "TestUser"
				}
			})
		}
	},
	author: { id: "test_user_123", bot: false, system: false, username: "TestUser" },
	id: "test_message_123",
	system: false,
	type: 0, // MessageType.Default
	fetch: vi.fn(),
	...overrides,
});

describe("System Message Filtering", () => {
	let _guildId: string;

	beforeEach(() => {
		// Clean up test database
		db.exec("DELETE FROM daily_bonus_tracking");
		db.exec("DELETE FROM reputation_events");

		_guildId = generateGuildId();
		vi.clearAllMocks();
	});

	describe("Message Type Filtering", () => {
		it("should process normal messages (MessageType.Default)", async () => {
			const message = createMockMessage({
				type: 0, // MessageType.Default
			});

			// Mock the onMessageCreate logic
			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(message);

			// Should call awardDailyBonus for normal messages
			expect(awardDailyBonus).toHaveBeenCalled();
		});

		it("should process reply messages (MessageType.Reply)", async () => {
			const message = createMockMessage({
				type: 19, // MessageType.Reply
			});

			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(message);

			// Should call awardDailyBonus for replies
			expect(awardDailyBonus).toHaveBeenCalled();
		});

		it("should skip system messages (join/leave)", async () => {
			const message = createMockMessage({
				system: true,
				type: 7, // MessageType.UserJoin
			});

			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(message);

			// Should NOT call awardDailyBonus for system messages
			expect(awardDailyBonus).not.toHaveBeenCalled();
		});

		it("should skip bot messages", async () => {
			const message = createMockMessage({
				author: { id: "bot_123", bot: true, system: false, username: "TestBot" },
			});

			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(message);

			// Should NOT call awardDailyBonus for bot messages
			expect(awardDailyBonus).not.toHaveBeenCalled();
		});

		it("should skip system user messages", async () => {
			const message = createMockMessage({
				author: { id: "system_123", bot: false, system: true, username: "System" },
			});

			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(message);

			// Should NOT call awardDailyBonus for system user messages
			expect(awardDailyBonus).not.toHaveBeenCalled();
		});

		it("should skip non-default message types", async () => {
			const message = createMockMessage({
				type: 8, // MessageType.ChannelPinnedMessage
			});

			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(message);

			// Should NOT call awardDailyBonus for pinned messages
			expect(awardDailyBonus).not.toHaveBeenCalled();
		});
	});

	describe("Edge Cases", () => {
		it("should handle missing author gracefully", async () => {
			const message = createMockMessage({
				author: null,
			});

			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(message);

			// Should NOT call awardDailyBonus when author is missing
			expect(awardDailyBonus).not.toHaveBeenCalled();
		});

		it("should handle missing guild gracefully", async () => {
			const message = createMockMessage({
				guild: null,
			});

			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(message);

			// Should NOT call awardDailyBonus when guild is missing
			expect(awardDailyBonus).not.toHaveBeenCalled();
		});

		it("should handle partial messages", async () => {
			const message = createMockMessage({
				partial: true,
				fetch: vi.fn().mockResolvedValue({
					...createMockMessage(),
					partial: false,
				}),
			});

			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(message);

			// Should fetch partial message and then process
			expect(message.fetch).toHaveBeenCalled();
		});
	});

	describe("Real-World Scenarios", () => {
		it("should ignore Discord join messages", async () => {
			const joinMessage = createMockMessage({
				system: true,
				type: 7, // MessageType.UserJoin
				content: "TestUser ist dem Server beigetreten.",
			});

			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(joinMessage);

			expect(awardDailyBonus).not.toHaveBeenCalled();
		});

		it("should ignore Discord leave messages", async () => {
			const leaveMessage = createMockMessage({
				system: true,
				type: 8, // MessageType.UserLeave  
				content: "TestUser hat den Server verlassen.",
			});

			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(leaveMessage);

			expect(awardDailyBonus).not.toHaveBeenCalled();
		});

		it("should process user's first real message after joining", async () => {
			const realMessage = createMockMessage({
				system: false,
				type: 0, // MessageType.Default
				content: "Hello everyone!",
			});

			const { onMessageCreate } = await import("@/bot/events/onMessageCreate");
			await onMessageCreate(realMessage);

			// Should process real user messages
			expect(awardDailyBonus).toHaveBeenCalled();
		});
	});
});