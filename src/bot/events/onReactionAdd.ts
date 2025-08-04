import { MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";
import { addReputationForReaction } from "@/core/usecases/addReputationForReaction";
import { UserInfo } from "@/core/types/UserInfo";
import { getDiscordNotificationService } from "@/bot/services/discordNotificationService";
import { discordRoleService } from "@/bot/services/discordRoleService";

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

export async function onReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
	try {
		// Discord API data fetching
		if (reaction.partial) {
			await reaction.fetch();
		}
		if (reaction.message.partial) {
			await reaction.message.fetch();
		}
		if (user.partial) {
			await user.fetch();
		}

		const message = reaction.message;
		const guildId = message.guild?.id;
		const messageId = message.id;
		const authorId = message.author?.id;
		const reactorId = user.id;
		const emoji = reaction.emoji.name ?? "";

		// Basic validation of Discord data
		if (!guildId || !authorId || !reactorId || !message.guild) {
			return;
		}

		// Convert Discord entities to platform-agnostic UserInfo
		const recipient = await createUserInfo(authorId, message.guild);
		const reactor = await createUserInfo(reactorId, message.guild);

		if (!recipient || !reactor) {
			console.debug("Failed to create user info, skipping reputation award");
			return;
		}

		// Delegate all business logic to core layer
		const result = await addReputationForReaction({
			guildId,
			messageId,
			recipient,
			reactor,
			emoji,
		});

		// Send notification if reputation was successfully awarded
		if (result.success && result.points && result.points > 0) {
			const notificationService = getDiscordNotificationService();
			if (notificationService) {
				const channelName = message.channel && "name" in message.channel ? message.channel.name || undefined : undefined;

				await notificationService.sendNotification({
					type: "trophy_given",
					guildId,
					userId: reactor.id,
					userName: reactor.displayName || reactor.username || `User-${reactor.id}`,
					points: result.points,
					context: {
						channelName,
						recipientName: recipient.displayName,
						recipientId: recipient.id,
						sourceType: "reaction",
					},
				});
			}

			// Check for rank updates
			try {
				const currentRp = result.newTotal || 0;
				const roleUpdate = await discordRoleService.updateUserRank(message.guild, recipient.id, currentRp);

				if (roleUpdate.success && roleUpdate.updated) {
					console.log(
						`Rank updated for ${recipient.username} (${currentRp} RP): ${roleUpdate.previousRole || 'None'} → ${roleUpdate.newRole || 'None'}`
					);
				}
			} catch (error) {
				console.error("Error updating user rank after reputation award:", error);
			}
		}
	} catch (err) {
		console.error("Fehler in onReactionAdd:", err);
	}
}
