import {MessageReaction, PartialMessageReaction, PartialUser, User} from 'discord.js';
import { addReputationForReaction } from '@/core/usecases/addReputationForReaction';
import { UserInfo } from '@/core/types/UserInfo';

async function createUserInfo(userId: string, guild: any): Promise<UserInfo | null> {
    try {
        const member = await guild.members.fetch(userId);
        return {
            id: userId,
            isBot: member.user.bot,
            username: member.user.username,
            displayName: member.user.displayName || member.user.username
        };
    } catch (error) {
        console.error(`Failed to fetch user info for ${userId}:`, error);
        return null;
    }
}

export async function onReactionAdd(reaction: MessageReaction|PartialMessageReaction, user: User|PartialUser) {
    try {
        // Discord API data fetching
        if (reaction.partial) {await reaction.fetch();}
        if (reaction.message.partial) {await reaction.message.fetch();}
        if (user.partial) {await user.fetch();}

        const message = reaction.message;
        const guildId = message.guild?.id;
        const messageId = message.id;
        const authorId = message.author?.id;
        const reactorId = user.id;
        const emoji = reaction.emoji.name ?? '';

        // Basic validation of Discord data
        if (!guildId || !authorId || !reactorId || !message.guild) {return;}

        // Convert Discord entities to platform-agnostic UserInfo
        const recipient = await createUserInfo(authorId, message.guild);
        const reactor = await createUserInfo(reactorId, message.guild);

        if (!recipient || !reactor) {
            console.debug('Failed to create user info, skipping reputation award');
            return;
        }

        // Delegate all business logic to core layer
        await addReputationForReaction({
            guildId,
            messageId,
            recipient,
            reactor,
            emoji
        });
    } catch (err) {
        console.error('Fehler in onReactionAdd:', err);
    }
}
