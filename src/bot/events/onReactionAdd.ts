import {MessageReaction, PartialMessageReaction, PartialUser, User} from 'discord.js';
import { addReputationForReaction } from '@/core/usecases/addReputationForReaction';

export async function onReactionAdd(reaction: MessageReaction|PartialMessageReaction, user: User|PartialUser) {
    try {
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();
        if (user.partial) await user.fetch();

        const message = reaction.message;
        const guildId = message.guild?.id;
        const messageId = message.id;
        const authorId = message.author?.id;
        const reactorId = user.id;
        const emoji = reaction.emoji.name ?? '';

        if (!guildId || !authorId || !reactorId || reactorId === authorId) return;

        await addReputationForReaction({
            guildId,
            messageId,
            recipientId: authorId,
            reactorId,
            emoji
        });
    } catch (err) {
        console.error('Fehler in onReactionAdd:', err);
    }
}
