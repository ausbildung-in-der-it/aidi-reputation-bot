import { UserInfo } from "@/core/types/UserInfo";
import { introductionChannelService } from "@/core/services/introductionChannelService";
import { introductionReplyService } from "@/core/services/introductionReplyService";
import { reputationService } from "@/core/services/reputationService";
import { INTRODUCTION_CONFIG } from "@/config/reputation";

export interface IntroductionBonusInput {
	guildId: string;
	channelId: string;
	user: UserInfo;
	messageId: string;
	isReply: boolean;
	originalMessageId?: string; // Required if isReply is true
	isThreadStarter?: boolean; // True if this is the first message in a forum thread
	threadOwnerId?: string; // ID of the thread owner (for preventing self-replies)
}

export interface IntroductionBonusResult {
	success: boolean;
	awarded: boolean;
	points: number;
	bonusType: "post" | "reply" | "none";
	reason: string;
	replyLimitInfo?: {
		repliesUsed: number;
		maxReplies: number;
		remainingReplies: number;
	};
}

export async function awardIntroductionBonus(input: IntroductionBonusInput): Promise<IntroductionBonusResult> {
	try {
		// Check if introduction bonus system is enabled
		if (!INTRODUCTION_CONFIG.enabled) {
			return {
				success: true,
				awarded: false,
				points: 0,
				bonusType: "none",
				reason: "Introduction bonus system is disabled",
			};
		}

		// Ignore bots
		if (input.user.isBot) {
			return {
				success: true,
				awarded: false,
				points: 0,
				bonusType: "none",
				reason: "Bots cannot receive introduction bonuses",
			};
		}

		// Check if this channel is configured as introduction channel
		if (!introductionChannelService.isIntroductionChannel(input.guildId, input.channelId)) {
			return {
				success: true,
				awarded: false,
				points: 0,
				bonusType: "none",
				reason: "Message not in configured introduction channel",
			};
		}

		// Handle original post (not a reply)
		if (!input.isReply) {
			return handlePostBonus(input);
		}

		// Handle reply to existing post
		if (input.isReply && input.originalMessageId) {
			return handleReplyBonus(input);
		}

		// Invalid input - reply without originalMessageId
		return {
			success: false,
			awarded: false,
			points: 0,
			bonusType: "none",
			reason: "Reply message missing original message ID",
		};
	} catch (error) {
		console.error("Error awarding introduction bonus:", error);
		return {
			success: false,
			awarded: false,
			points: 0,
			bonusType: "none",
			reason: "Internal error occurred",
		};
	}
}

function handlePostBonus(input: IntroductionBonusInput): IntroductionBonusResult {
	const points = INTRODUCTION_CONFIG.postBonus;
	const postType = input.isThreadStarter ? "forum thread" : "introduction post";
	const emoji = input.isThreadStarter ? "forum_post" : "introduction_post";

	// Check if user already received introduction post bonus in this guild
	const existingPostBonus = reputationService.hasUserReceivedBonus(input.guildId, input.user.id, [
		"introduction_post",
		"forum_post",
	]);

	if (existingPostBonus) {
		return {
			success: true,
			awarded: false,
			points: 0,
			bonusType: "post",
			reason: "You can only receive one introduction post bonus per server",
		};
	}

	// Award bonus for original post
	// Use unique message ID to avoid conflict with daily bonus
	reputationService.trackReputationReaction({
		guildId: input.guildId,
		messageId: `${input.messageId}_intro_post`,
		toUserId: input.user.id,
		fromUserId: "system",
		emoji,
		amount: points,
	});

	return {
		success: true,
		awarded: true,
		points,
		bonusType: "post",
		reason: `Awarded ${points} RP for ${postType}`,
	};
}

function handleReplyBonus(input: IntroductionBonusInput): IntroductionBonusResult {
	if (!input.originalMessageId) {
		return {
			success: false,
			awarded: false,
			points: 0,
			bonusType: "none",
			reason: "Original message ID required for reply bonus",
		};
	}

	// Prevent thread owner from getting reply bonus in their own thread
	if (input.threadOwnerId && input.user.id === input.threadOwnerId) {
		return {
			success: true,
			awarded: false,
			points: 0,
			bonusType: "reply",
			reason: "Cannot receive reply bonus in your own introduction thread",
		};
	}

	// Check reply limits
	const limitCheck = introductionReplyService.checkReplyLimits(input.guildId, input.user.id, input.originalMessageId);

	if (!limitCheck.canReply) {
		return {
			success: true,
			awarded: false,
			points: 0,
			bonusType: "reply",
			reason: limitCheck.reason || "Reply limit exceeded",
			replyLimitInfo: {
				repliesUsed: limitCheck.repliesUsed,
				maxReplies: limitCheck.maxReplies,
				remainingReplies: Math.max(0, Number(limitCheck.maxReplies) - Number(limitCheck.repliesUsed)),
			},
		};
	}

	const points = INTRODUCTION_CONFIG.replyBonus;

	// Award reply bonus
	// Use unique message ID to avoid conflict with daily bonus
	reputationService.trackReputationReaction({
		guildId: input.guildId,
		messageId: `${input.messageId}_intro_reply`,
		toUserId: input.user.id,
		fromUserId: "system",
		emoji: "introduction_reply",
		amount: points,
	});

	// Track the reply to prevent duplicate bonuses
	introductionReplyService.trackReply(input.guildId, input.user.id, input.originalMessageId);

	const newRepliesUsed = limitCheck.repliesUsed + 1;

	return {
		success: true,
		awarded: true,
		points,
		bonusType: "reply",
		reason: `Awarded ${points} RP for greeting a new member`,
		replyLimitInfo: {
			repliesUsed: newRepliesUsed,
			maxReplies: limitCheck.maxReplies,
			remainingReplies: Math.max(0, limitCheck.maxReplies - newRepliesUsed),
		},
	};
}
