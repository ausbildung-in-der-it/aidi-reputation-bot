import { UserInfo } from "@/core/types/UserInfo";
import { dailyBonusService } from "@/core/services/dailyBonusService";
import { reputationService } from "@/core/services/reputationService";
import { DAILY_BONUS_CONFIG } from "@/config/reputation";

export interface DailyBonusInput {
	guildId: string;
	user: UserInfo;
	messageId: string;
	messageTimestamp?: Date;
}

export interface DailyBonusResult {
	success: boolean;
	awarded: boolean;
	points: number;
	reason: string;
	bonusDate?: string;
}

export async function awardDailyBonus(input: DailyBonusInput): Promise<DailyBonusResult> {
	try {
		// Check if daily bonus is enabled
		if (!DAILY_BONUS_CONFIG.enabled) {
			return {
				success: true,
				awarded: false,
				points: 0,
				reason: "Daily bonus is disabled",
			};
		}

		// Ignore bots
		if (input.user.isBot) {
			return {
				success: true,
				awarded: false,
				points: 0,
				reason: "Bots cannot receive daily bonus",
			};
		}

		// Check if user can receive daily bonus
		const bonusCheck = dailyBonusService.checkDailyBonus(input.guildId, input.user.id);

		if (!bonusCheck.canReceive) {
			return {
				success: true,
				awarded: false,
				points: 0,
				reason: "Daily bonus already received today",
				bonusDate: bonusCheck.bonusDate,
			};
		}

		// Award the daily bonus
		const points = DAILY_BONUS_CONFIG.points;

		// Track as reputation event (using special "daily_bonus" emoji)
		reputationService.trackReputationReaction({
			guildId: input.guildId,
			messageId: input.messageId,
			toUserId: input.user.id,
			fromUserId: "system", // System-awarded
			emoji: "daily_bonus",
			amount: points,
		});

		// Track in daily bonus table
		dailyBonusService.trackDailyBonus(input.guildId, input.user.id, bonusCheck.bonusDate);

		return {
			success: true,
			awarded: true,
			points,
			reason: "Daily bonus awarded for first message of the day",
			bonusDate: bonusCheck.bonusDate,
		};
	} catch (error) {
		console.error("Error awarding daily bonus:", error);
		return {
			success: false,
			awarded: false,
			points: 0,
			reason: "Internal error occurred",
		};
	}
}