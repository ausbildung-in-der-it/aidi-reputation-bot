import { reputationService } from '@/core/services/reputationService';

export async function removeReputationForReaction(input: {
    guildId: string;
    messageId: string;
    reactorId: string;
}) {
    reputationService.removeReputationReaction(input.guildId, input.messageId, input.reactorId);
}
