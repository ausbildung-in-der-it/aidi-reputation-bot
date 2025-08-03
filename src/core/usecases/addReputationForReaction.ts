import { reputationService } from '@/core/services/reputationService';
import { rateLimitService } from '@/core/services/rateLimitService';
import { getEmojiPoints } from '@/config/reputation';
import { UserInfo, ReputationValidationError } from '@/core/types/UserInfo';

export interface ReputationAwardResult {
    success: boolean;
    points?: number;
    newTotal?: number;
    recipient?: UserInfo;
    reactor?: UserInfo;
    error?: ReputationValidationError;
    reason?: string;
}

export async function addReputationForReaction(input: {
    guildId: string;
    messageId: string;
    recipient: UserInfo;
    reactor: UserInfo;
    emoji: string;
}): Promise<ReputationAwardResult> {
    // Business Rule 1: Self-award prevention
    if (input.recipient.id === input.reactor.id) {
        console.debug(`Prevented self-award by user ${input.reactor.id} in guild ${input.guildId}`);
        return { 
            success: false, 
            error: ReputationValidationError.SELF_AWARD,
            reason: ReputationValidationError.SELF_AWARD
        };
    }

    // Business Rule 2: Bot recipient prevention
    if (input.recipient.isBot) {
        console.debug(`Prevented reputation award to bot: ${input.recipient.username} in guild ${input.guildId}`);
        return { 
            success: false, 
            error: ReputationValidationError.BOT_RECIPIENT,
            reason: ReputationValidationError.BOT_RECIPIENT
        };
    }

    // Business Rule 3: Emoji validation
    const points = getEmojiPoints(input.emoji);
    if (points === null) {
        console.debug(`Ignored unsupported emoji: ${input.emoji} in guild ${input.guildId}`);
        return { 
            success: false, 
            error: ReputationValidationError.UNSUPPORTED_EMOJI,
            reason: ReputationValidationError.UNSUPPORTED_EMOJI
        };
    }

    // Business Rule 4: Rate limiting
    const rateLimitCheck = rateLimitService.checkLimits(
        input.guildId,
        input.reactor.id,
        input.recipient.id
    );

    if (!rateLimitCheck.allowed) {
        const error = rateLimitCheck.reason?.includes('Daily limit') 
            ? ReputationValidationError.DAILY_LIMIT_EXCEEDED
            : ReputationValidationError.RECIPIENT_LIMIT_EXCEEDED;
            
        console.debug(`Rate limit exceeded: ${rateLimitCheck.reason} for user ${input.reactor.id} in guild ${input.guildId}`);
        return { 
            success: false, 
            error,
            reason: rateLimitCheck.reason 
        };
    }

    // Award reputation
    reputationService.trackReputationReaction({
        guildId: input.guildId,
        messageId: input.messageId,
        toUserId: input.recipient.id,
        fromUserId: input.reactor.id,
        emoji: input.emoji,
        amount: points
    });

    // Record rate limit
    rateLimitService.recordAward(input.guildId, input.reactor.id, input.recipient.id);

    // Get new total reputation
    const newTotal = reputationService.getUserReputation(input.guildId, input.recipient.id);

    return {
        success: true,
        points,
        newTotal,
        recipient: input.recipient,
        reactor: input.reactor
    };
}
