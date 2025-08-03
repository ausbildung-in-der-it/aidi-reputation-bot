import { Message, PartialMessage } from "discord.js";
import { awardDailyBonus } from "@/core/usecases/awardDailyBonus";
import { awardIntroductionBonus } from "@/core/usecases/awardIntroductionBonus";
import { UserInfo } from "@/core/types/UserInfo";
import { discordRoleService } from "@/bot/services/discordRoleService";
import { reputationService } from "@/core/services/reputationService";

async function createUserInfo(userId: string, guild: any): Promise<UserInfo | null> {
	try {
		const member = await guild.members.fetch(userId);
		return {
			id: userId,
			isBot: member.user.bot,
			username: member.user.username,
			displayName: member.user.displayName || member.user.username,
		};
	} catch (error) {
		console.error(`Failed to fetch user info for ${userId}:`, error);
		return null;
	}
}

export async function onMessageCreate(message: Message | PartialMessage) {
	try {
		// Discord API data fetching
		if (message.partial) {
			await message.fetch();
		}

		const guildId = message.guild?.id;
		const authorId = message.author?.id;
		const messageId = message.id;

		// Basic validation of Discord data
		if (!guildId || !authorId || !message.guild || !message.author) {
			return;
		}

		// Convert Discord entity to platform-agnostic UserInfo
		const user = await createUserInfo(authorId, message.guild);

		if (!user) {
			console.debug("Failed to create user info, skipping daily bonus check");
			return;
		}

		// Delegate business logic to core layer
		// 1. Check for daily bonus
		const dailyResult = await awardDailyBonus({
			guildId,
			user,
			messageId,
			messageTimestamp: message.createdAt,
		});

		// 2. Check for introduction channel bonus (Forum Channels only)
		const channel = message.channel;
		
		// Only process messages in forum threads
		if (!channel || !('parent' in channel) || !channel.parent?.id) {
			return; // Skip non-forum messages
		}
		
		const forumChannelId = channel.parent.id;
		
		// Detect thread starter vs thread reply
		// Thread starter: Message author is thread owner AND it's the very first message (within 1 second) AND no message reference
		const isThreadOwner = 'ownerId' in channel && channel.ownerId === message.author?.id;
		const isVeryFirstMessage = message.createdTimestamp && 'createdTimestamp' in channel && 
			Math.abs(message.createdTimestamp - (channel.createdTimestamp || 0)) < 1000; // Within 1 second only
		const hasNoReference = !message.reference?.messageId; // Thread starters don't reference other messages
		
		const isThreadStarter = isThreadOwner && isVeryFirstMessage && hasNoReference;
		const isThreadReply = !isThreadStarter;
		
		// For forum thread replies, use thread ID as the original message reference
		const originalMessageId = isThreadReply ? channel.id : undefined;
		
		// Debug logging
		console.log(`Forum message debug: threadId=${channel.id}, authorId=${message.author?.id}, ownerId=${'ownerId' in channel ? channel.ownerId : 'N/A'}, timeDiff=${message.createdTimestamp && 'createdTimestamp' in channel ? Math.abs(message.createdTimestamp - (channel.createdTimestamp || 0)) : 'N/A'}ms, hasNoReference=${hasNoReference}, isThreadStarter=${isThreadStarter}, isThreadReply=${isThreadReply}`);
		
		const introductionResult = await awardIntroductionBonus({
			guildId,
			channelId: forumChannelId,
			user,
			messageId,
			isReply: isThreadReply,
			originalMessageId,
			isThreadStarter,
			threadOwnerId: 'ownerId' in channel ? channel.ownerId : undefined,
		});

		// Optional: Log successful bonus awards
		if (dailyResult.success && dailyResult.awarded) {
			console.log(
				`Daily bonus awarded: ${dailyResult.points} RP to ${user.username} in guild ${guildId} on ${dailyResult.bonusDate}`
			);
		}

		if (introductionResult.success && introductionResult.awarded) {
			console.log(
				`Introduction ${introductionResult.bonusType} bonus awarded: ${introductionResult.points} RP to ${user.username} in guild ${guildId}`
			);
		}

		// Check for rank updates if any RP was awarded
		if ((dailyResult.success && dailyResult.awarded) || (introductionResult.success && introductionResult.awarded)) {
			try {
				const currentRp = reputationService.getUserReputation(guildId, user.id);
				const roleUpdate = await discordRoleService.updateUserRank(message.guild!, user.id, currentRp);
				
				if (roleUpdate.success && roleUpdate.updated) {
					console.log(
						`Rank updated for ${user.username} in guild ${guildId}: ${roleUpdate.previousRole || 'None'} → ${roleUpdate.newRole || 'None'}`
					);
				}
			} catch (rankError) {
				console.error("Error updating user rank:", rankError);
			}
		}
	} catch (err) {
		console.error("Error in onMessageCreate:", err);
	}
}