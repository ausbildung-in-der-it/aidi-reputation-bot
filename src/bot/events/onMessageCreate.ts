import { Message, PartialMessage, MessageType } from "discord.js";
import { awardDailyBonus } from "@/core/usecases/awardDailyBonus";
import { awardIntroductionBonus } from "@/core/usecases/awardIntroductionBonus";
import { UserInfo } from "@/core/types/UserInfo";
import { discordRoleService } from "@/bot/services/discordRoleService";
import { reputationService } from "@/core/services/reputationService";
import { getDiscordNotificationService } from "@/bot/services/discordNotificationService";

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

		// Skip system messages (join/leave/etc.)
		if (message.system || message.author.system) {
			return;
		}

		// Skip bot messages
		if (message.author.bot) {
			return;
		}

		// Only process normal messages and replies
		if (message.type !== MessageType.Default && message.type !== MessageType.Reply) {
			console.debug(`Skipping message type ${message.type} from ${message.author.username} in guild ${guildId}`);
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
		if (!channel || !("parent" in channel) || !channel.parent?.id) {
			console.debug(`[INTRO DEBUG] Skipping non-forum message: channelType=${channel?.type}, hasParent=${"parent" in channel}, parentId=${("parent" in channel) ? channel.parent?.id : "N/A"}, guild=${guildId}, user=${user.username}`);
			return; // Skip non-forum messages
		}

		const forumChannelId = channel.parent.id;
		console.debug(`[INTRO DEBUG] Processing forum message: forumChannelId=${forumChannelId}, threadId=${channel.id}, guild=${guildId}, user=${user.username}`);

		// Detect thread starter vs thread reply
		// Thread starter: Message author is thread owner AND it's the very first message (within 1 second) AND no message reference
		const isThreadOwner = "ownerId" in channel && channel.ownerId === message.author?.id;
		const isVeryFirstMessage = !!(
			message.createdTimestamp &&
			"createdTimestamp" in channel &&
			Math.abs(message.createdTimestamp - (channel.createdTimestamp || 0)) < 1000
		); // Within 1 second only
		const hasNoReference = !message.reference?.messageId; // Thread starters don't reference other messages

		const isThreadStarter = isThreadOwner && isVeryFirstMessage && hasNoReference;
		const isThreadReply = !isThreadStarter;

		// For forum thread replies, use thread ID as the original message reference
		const originalMessageId = isThreadReply ? channel.id : undefined;

		// Debug logging
		console.log(
			`[INTRO DEBUG] Forum message analysis: threadId=${channel.id}, authorId=${message.author?.id}, ownerId=${"ownerId" in channel ? channel.ownerId : "N/A"}, timeDiff=${message.createdTimestamp && "createdTimestamp" in channel ? Math.abs(message.createdTimestamp - (channel.createdTimestamp || 0)) : "N/A"}ms, hasNoReference=${hasNoReference}, isThreadStarter=${isThreadStarter}, isThreadReply=${isThreadReply}, guild=${guildId}, user=${user.username}`
		);

		const introductionResult = await awardIntroductionBonus({
			guildId,
			channelId: forumChannelId,
			user,
			messageId,
			isReply: isThreadReply,
			originalMessageId,
			isThreadStarter,
			threadOwnerId: "ownerId" in channel ? channel.ownerId : undefined,
		});

		console.log(`[INTRO DEBUG] Introduction bonus result: success=${introductionResult.success}, awarded=${introductionResult.awarded}, points=${introductionResult.points}, bonusType=${introductionResult.bonusType}, reason="${introductionResult.reason}", guild=${guildId}, user=${user.username}`);

		// Send notifications for successful bonus awards
		const notificationService = getDiscordNotificationService();
		console.log(`[INTRO DEBUG] Notification service available: ${notificationService !== null}, guild=${guildId}, user=${user.username}`);

		if (dailyResult.success && dailyResult.awarded && notificationService) {
			console.log(
				`Daily bonus awarded: ${dailyResult.points} RP to ${user.username} in guild ${guildId} on ${dailyResult.bonusDate}`
			);

			await notificationService.sendNotification({
				type: "daily_bonus",
				guildId,
				userId: user.id,
				userName: user.displayName || user.username || `User-${user.id}`,
				points: dailyResult.points,
				context: {
					sourceType: "daily",
				},
			});
		}

		if (introductionResult.success && introductionResult.awarded && notificationService) {
			console.log(
				`[INTRO DEBUG] Sending introduction notification: ${introductionResult.bonusType} bonus awarded: ${introductionResult.points} RP to ${user.username} in guild ${guildId}`
			);

			const channelName = message.channel && "name" in message.channel ? message.channel.name || undefined : undefined;

			try {
				await notificationService.sendNotification({
					type: "introduction_bonus",
					guildId,
					userId: user.id,
					userName: user.displayName || user.username || `User-${user.id}`,
					points: introductionResult.points,
					context: {
						channelName,
						sourceType: introductionResult.bonusType === "post" ? "post" : "reply",
					},
				});
				console.log(`[INTRO DEBUG] Introduction notification sent successfully, guild=${guildId}, user=${user.username}`);
			} catch (error) {
				console.error(`[INTRO DEBUG] Failed to send introduction notification: ${error}, guild=${guildId}, user=${user.username}`);
			}
		} else {
			console.log(`[INTRO DEBUG] Not sending introduction notification: success=${introductionResult.success}, awarded=${introductionResult.awarded}, notificationService=${notificationService !== null}, guild=${guildId}, user=${user.username}`);
		}

		// Check for rank updates if any RP was awarded
		if (
			(dailyResult.success && dailyResult.awarded) ||
			(introductionResult.success && introductionResult.awarded)
		) {
			try {
				const currentRp = reputationService.getUserReputation(guildId, user.id);
				const roleUpdate = await discordRoleService.updateUserRank(message.guild!, user.id, currentRp);

				if (roleUpdate.success && roleUpdate.updated) {
					console.log(
						`Rank updated for ${user.username} in guild ${guildId}: ${roleUpdate.previousRole || "None"} → ${roleUpdate.newRole || "None"}`
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
