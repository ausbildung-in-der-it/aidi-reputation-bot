import { reputationService } from '@/core/services/reputationService';

export async function addReputationForReaction(input: {
    guildId: string;
    messageId: string;
    recipientId: string;
    reactorId: string;
    emoji: string;
}) {
    if (input.recipientId === input.reactorId) return;
    if (input.emoji !== '🏆') return;

    reputationService.trackReputationReaction({
        guildId: input.guildId,
        messageId: input.messageId,
        toUserId: input.recipientId,
        fromUserId: input.reactorId,
        emoji: input.emoji,
        amount: 1
    });
}
