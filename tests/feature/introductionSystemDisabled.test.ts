import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { configureIntroductionChannel } from "@/core/usecases/configureIntroductionChannel";
import { awardIntroductionBonus } from "@/core/usecases/awardIntroductionBonus";
import { reputationService } from "@/core/services/reputationService";
import { db } from "@/db/sqlite";
import { createTestUser, generateGuildId, generateMessageId } from "../setup/testUtils";

// Mock config with introduction system DISABLED
vi.mock("@/config/reputation", () => ({
	INTRODUCTION_CONFIG: {
		enabled: false,
		postBonus: 5,
		replyBonus: 2,
		maxRepliesPerUser: 5,
	},
}));

describe("Introduction System Disabled", () => {
	let guildId: string;
	let channelId: string;
	let adminUserId: string;

	beforeEach(async () => {
		// Clean up test database for each test
		db.exec("DELETE FROM reputation_events");
		db.exec("DELETE FROM reputation_rate_limits");
		db.exec("DELETE FROM daily_bonus_tracking");
		db.exec("DELETE FROM introduction_channel_config");
		db.exec("DELETE FROM introduction_reply_tracking");

		guildId = generateGuildId();
		channelId = generateMessageId();
		adminUserId = "admin_123";
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should not award bonuses when system is disabled", async () => {
		// Configure channel (this should still work)
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
		expect(result.awarded).toBe(false);
		expect(result.points).toBe(0);
		expect(result.bonusType).toBe("none");
		expect(result.reason).toBe("Introduction bonus system is disabled");

		// User should have no reputation
		const userReputation = reputationService.getUserReputation(guildId, user.id);
		expect(userReputation).toBe(0);
	});

	it("should not award reply bonuses when system is disabled", async () => {
		await configureIntroductionChannel({ guildId, channelId, configuredBy: adminUserId });

		const user = createTestUser("user_123");
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
		expect(result.bonusType).toBe("none");
		expect(result.reason).toBe("Introduction bonus system is disabled");

		// User should have no reputation
		const userReputation = reputationService.getUserReputation(guildId, user.id);
		expect(userReputation).toBe(0);
	});
});