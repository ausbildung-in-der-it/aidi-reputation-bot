import {MessageReaction, PartialMessageReaction, PartialUser, User} from 'discord.js';
import { removeReputationForReaction } from '@/core/usecases/removeReputationForReaction';

export async function onReactionRemove(reaction: MessageReaction|PartialMessageReaction, user: User|PartialUser) {
    try {
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();
        if (user.partial) await user.fetch();

        const message = reaction.message;
        const guildId = message.guild?.id;
        const messageId = message.id;
        const reactorId = user.id;

        if (!guildId || !messageId || !reactorId) return;

        await removeReputationForReaction({
            guildId,
            messageId,
            reactorId
        });
    } catch (err) {
        console.error('Fehler in onReactionRemove:', err);
    }
}
