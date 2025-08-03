import { reputationService } from '@/core/services/reputationService';
import { getEmojiPoints } from '@/config/reputation';

export interface ReputationAwardResult {
    success: boolean;
    points?: number;
    newTotal?: number;
    recipientId?: string;
    reactorId?: string;
}

export async function addReputationForReaction(input: {
    guildId: string;
    messageId: string;
    recipientId: string;
    reactorId: string;
    emoji: string;
}): Promise<ReputationAwardResult> {
    if (input.recipientId === input.reactorId) {
        return { success: false };
    }

    const points = getEmojiPoints(input.emoji);
    if (points === null) {
        console.debug(`Ignored unsupported emoji: ${input.emoji} in guild ${input.guildId}`);
        return { success: false };
    }

    reputationService.trackReputationReaction({
        guildId: input.guildId,
        messageId: input.messageId,
        toUserId: input.recipientId,
        fromUserId: input.reactorId,
        emoji: input.emoji,
        amount: points
    });

    // Get new total reputation
    const newTotal = reputationService.getUserReputation(input.guildId, input.recipientId);

    return {
        success: true,
        points,
        newTotal,
        recipientId: input.recipientId,
        reactorId: input.reactorId
    };
}
