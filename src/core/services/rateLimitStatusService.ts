import { rateLimitService } from "./rateLimitService";
import { dailyBonusService } from "./dailyBonusService";
import { introductionReplyService } from "./introductionReplyService";
import { RATE_LIMIT_CONFIG, INTRODUCTION_CONFIG } from "@/config/reputation";

export interface TrophyLimitStatus {
	used: number;
	limit: number;
	remaining: number;
}

export interface DailyBonusStatus {
	received: boolean;
	available: boolean;
}

export interface IntroductionPostStatus {
	available: boolean;
	bonus: number;
}

export interface IntroductionReplyStatus {
	used: number;
	limit: number;
	remaining: number;
}

export interface UserRateLimitStatus {
	trophies: TrophyLimitStatus;
	dailyBonus: DailyBonusStatus;
	introductionPost: IntroductionPostStatus;
	introductionReplies: IntroductionReplyStatus;
}

export const rateLimitStatusService = {
	getUserRateLimitStatus: (guildId: string, userId: string): UserRateLimitStatus => {
		// Get trophy rate limit status
		const trophyCheck = rateLimitService.checkLimits(guildId, userId, "dummy");
		const trophyStatus: TrophyLimitStatus = {
			used: trophyCheck.dailyUsed || 0,
			limit: trophyCheck.dailyLimit || RATE_LIMIT_CONFIG.dailyLimit,
			remaining: Math.max(0, (trophyCheck.dailyLimit || RATE_LIMIT_CONFIG.dailyLimit) - (trophyCheck.dailyUsed || 0)),
		};

		// Get daily bonus status
		const bonusCheck = dailyBonusService.checkDailyBonus(guildId, userId);
		const dailyBonusStatus: DailyBonusStatus = {
			received: bonusCheck.alreadyReceived,
			available: bonusCheck.canReceive,
		};

		// Get introduction post status (always available, one-time bonus)
		const introductionPostStatus: IntroductionPostStatus = {
			available: true,
			bonus: INTRODUCTION_CONFIG.postBonus,
		};

		// Get introduction reply status
		const replyCheck = introductionReplyService.checkReplyLimits(guildId, userId, "dummy");
		const introductionReplyStatus: IntroductionReplyStatus = {
			used: replyCheck.repliesUsed,
			limit: replyCheck.maxReplies,
			remaining: Math.max(0, replyCheck.maxReplies - replyCheck.repliesUsed),
		};

		return {
			trophies: trophyStatus,
			dailyBonus: dailyBonusStatus,
			introductionPost: introductionPostStatus,
			introductionReplies: introductionReplyStatus,
		};
	},
};