import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { awardDailyBonus } from "@/core/usecases/awardDailyBonus";
import { reputationService } from "@/core/services/reputationService";
import { db } from "@/db/sqlite";
import { createTestUser, generateGuildId, generateMessageId } from "../setup/testUtils";

// Mock config with daily bonus DISABLED
vi.mock("@/config/reputation", () => ({
	DAILY_BONUS_CONFIG: {
		enabled: false,
		points: 1,
		timezone: "Europe/Berlin",
	},
	getCurrentDateInTimezone: (_timezone: string) => "2024-01-15",
}));

describe("Daily Bonus Disabled", () => {
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

	it("should not award when daily bonus is disabled", async () => {
		const user = createTestUser("user_123");

		const result = await awardDailyBonus({
			guildId,
			user,
			messageId,
		});

		expect(result.success).toBe(true);
		expect(result.awarded).toBe(false);
		expect(result.points).toBe(0);
		expect(result.reason).toBe("Daily bonus is disabled");

		// User should have no reputation
		const userReputation = reputationService.getUserReputation(guildId, user.id);
		expect(userReputation).toBe(0);
	});
});
