import { NotificationEvent, notificationService } from "@/core/services/notificationService";
import { ChannelType, Client, TextChannel } from "discord.js";
import { logger } from "@/core/services/loggingService";

export class DiscordNotificationService {
	constructor(private client: Client) {}

	async sendNotification(event: NotificationEvent): Promise<void> {
		try {
			// Check if notifications should be sent for this guild
			const notificationData = notificationService.notify(event);
			if (!notificationData) {
				// Notifications disabled or not configured
				return;
			}

			// Get the channel
			const channel = await this.client.channels.fetch(notificationData.channelId);

			if (!channel) {
				logger.warn(`Notification channel not found`, {
					guildId: event.guildId,
					details: { channelId: notificationData.channelId }
				});
				return;
			}

			if (channel.type !== ChannelType.GuildText) {
				logger.warn(`Notification channel is not a text channel`, {
					guildId: event.guildId,
					details: { channelId: notificationData.channelId, channelType: channel.type }
				});
				return;
			}

			const textChannel = channel as TextChannel;

			// Check bot permissions
			const permissions = textChannel.permissionsFor(this.client.user!);
			if (!permissions?.has("SendMessages") || !permissions?.has("ViewChannel")) {
				logger.warn(`Bot lacks permissions to send notifications`, {
					guildId: event.guildId,
					details: {
						channelId: notificationData.channelId,
						hasSendMessages: permissions?.has("SendMessages"),
						hasViewChannel: permissions?.has("ViewChannel")
					}
				});
				return;
			}

			// Send the notification
			await textChannel.send(notificationData.message);
			logger.debug("Notification sent", {
				guildId: event.guildId,
				details: { 
					type: event.type,
					channelId: notificationData.channelId 
				}
			});
		} catch (error) {
			// Log error but don't throw - notifications are optional
			logger.error("Error sending notification", {
				guildId: event.guildId,
				error,
				details: { event }
			});
		}
	}
}

// Global instance that will be initialized with the Discord client
let discordNotificationService: DiscordNotificationService | null = null;

export function initializeDiscordNotificationService(client: Client): void {
	discordNotificationService = new DiscordNotificationService(client);
}

export function getDiscordNotificationService(): DiscordNotificationService | null {
	return discordNotificationService;
}
