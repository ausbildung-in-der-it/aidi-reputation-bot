import { Client, TextChannel, ChannelType } from "discord.js";
import { notificationService, NotificationEvent } from "@/core/services/notificationService";

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
				console.warn(`Notification channel not found: ${notificationData.channelId} in guild ${event.guildId}`);
				return;
			}

			if (channel.type !== ChannelType.GuildText) {
				console.warn(
					`Notification channel is not a text channel: ${notificationData.channelId} in guild ${event.guildId}`
				);
				return;
			}

			const textChannel = channel as TextChannel;

			// Check bot permissions
			const permissions = textChannel.permissionsFor(this.client.user!);
			if (!permissions?.has("SendMessages") || !permissions?.has("ViewChannel")) {
				console.warn(
					`Bot lacks permissions to send notifications in channel ${notificationData.channelId} in guild ${event.guildId}`
				);
				return;
			}

			// Send the notification
			await textChannel.send(notificationData.message);
		} catch (error) {
			// Log error but don't throw - notifications are optional
			console.error("Error sending notification:", error, { event });
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
