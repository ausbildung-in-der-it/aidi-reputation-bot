import { MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";
import { addReputationForReaction } from "@/core/usecases/addReputationForReaction";
import { UserInfo } from "@/core/types/UserInfo";
import { getDiscordNotificationService } from "@/bot/services/discordNotificationService";
import { discordRoleService } from "@/bot/services/discordRoleService";
import { logger } from "@/core/services/loggingService";

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
					logger.info(
						`Rank updated after reputation award`,
						{
							guildId: message.guild.id,
							userId: recipient.id,
							details: {
								username: recipient.username,
								rp: currentRp,
								previousRole: roleUpdate.previousRole || 'None',
								newRole: roleUpdate.newRole || 'None'
							}
						}
					);

					// Notify about rank promotion if notification service is available
					if (roleUpdate.newRole && roleUpdate.previousRole !== roleUpdate.newRole && notificationService) {
						await notificationService.sendNotification({
							type: "rank_promotion",
							guildId,
							userId: recipient.id,
							userName: recipient.displayName || recipient.username || `User-${recipient.id}`,
							points: currentRp,
							context: {
								newRank: roleUpdate.newRole,
								previousRank: roleUpdate.previousRole,
							},
						});
					}
				} else if (!roleUpdate.success) {
					logger.error(
						"Failed to update user rank after reputation award",
						{
							guildId: message.guild.id,
							userId: recipient.id,
							details: {
								error: roleUpdate.error,
								errorType: roleUpdate.errorType,
								rp: currentRp
							}
						}
					);

					// Send error notification to admins if it's a permission/hierarchy issue
					if ((roleUpdate.errorType === "permission" || roleUpdate.errorType === "hierarchy") && notificationService) {
						await notificationService.sendNotification({
							type: "role_error",
							guildId,
							userId: "admin",
							userName: "System",
							points: 0,
							context: {
								errorType: roleUpdate.errorType,
								error: roleUpdate.error,
								affectedUser: recipient.displayName || recipient.username,
								hint: "Verwende /manage-ranks validate um Probleme zu identifizieren"
							},
						});
					}
				}
			} catch (error) {
				logger.error("Error updating user rank after reputation award", { 
					guildId: message.guild?.id,
					userId: recipient.id,
					error 
				});
			}
		}
	} catch (err) {
		logger.error("Fehler in onReactionAdd", { 
			error: err 
		});
	}
}
