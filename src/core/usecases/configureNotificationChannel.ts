import { notificationService } from "@/core/services/notificationService";
import { UserInfo } from "@/core/types/UserInfo";

export interface NotificationChannelInput {
	guildId: string;
	channelId: string;
	configuredBy: UserInfo;
}

export interface NotificationChannelResult {
	success: boolean;
	message: string;
	channelId?: string;
	previousChannelId?: string;
}

export async function configureNotificationChannel(
	input: NotificationChannelInput
): Promise<NotificationChannelResult> {
	try {
		// Check if there's an existing configuration
		const existingConfig = notificationService.getChannelConfig(input.guildId);
		const previousChannelId = existingConfig?.channelId;

		// Set the new configuration
		notificationService.setChannelConfig({
			guildId: input.guildId,
			channelId: input.channelId,
			configuredBy: input.configuredBy.id,
			enabled: true,
		});

		const action = previousChannelId ? "aktualisiert" : "konfiguriert";
		const message = `Notification-Channel wurde erfolgreich ${action}. Reputation-Events werden jetzt in <#${input.channelId}> gepostet.`;

		return {
			success: true,
			message,
			channelId: input.channelId,
			previousChannelId,
		};
	} catch (error) {
		console.error("Error configuring notification channel:", error);
		return {
			success: false,
			message: "Fehler beim Konfigurieren des Notification-Channels. Bitte versuche es erneut.",
		};
	}
}

export interface ToggleNotificationInput {
	guildId: string;
	enabled: boolean;
	requestedBy: UserInfo;
}

export interface ToggleNotificationResult {
	success: boolean;
	message: string;
	enabled?: boolean;
}

export async function toggleNotificationChannel(input: ToggleNotificationInput): Promise<ToggleNotificationResult> {
	try {
		// Check if channel is configured
		const config = notificationService.getChannelConfig(input.guildId);
		if (!config) {
			return {
				success: false,
				message:
					"Kein Notification-Channel konfiguriert. Verwende `/set-notification-channel` um einen Channel zu konfigurieren.",
			};
		}

		// Toggle the setting
		const success = notificationService.toggleChannel(input.guildId, input.enabled);

		if (!success) {
			return {
				success: false,
				message: "Fehler beim Ändern der Notification-Einstellungen.",
			};
		}

		const status = input.enabled ? "aktiviert" : "deaktiviert";
		const message = `Notifications wurden ${status}. Channel: <#${config.channelId}>`;

		return {
			success: true,
			message,
			enabled: input.enabled,
		};
	} catch (error) {
		console.error("Error toggling notification channel:", error);
		return {
			success: false,
			message: "Fehler beim Ändern der Notification-Einstellungen. Bitte versuche es erneut.",
		};
	}
}

export interface GetNotificationStatusInput {
	guildId: string;
}

export interface GetNotificationStatusResult {
	configured: boolean;
	enabled: boolean;
	channelId?: string;
	configuredBy?: string;
	configuredAt?: string;
}

export async function getNotificationStatus(input: GetNotificationStatusInput): Promise<GetNotificationStatusResult> {
	const config = notificationService.getChannelConfig(input.guildId);

	if (!config) {
		return {
			configured: false,
			enabled: false,
		};
	}

	return {
		configured: true,
		enabled: config.enabled,
		channelId: config.channelId,
		configuredBy: config.configuredBy,
		configuredAt: config.configuredAt,
	};
}
