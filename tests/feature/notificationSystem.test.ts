import { describe, beforeEach, it, expect } from "vitest";
import { createTestUser } from "../setup/testUtils";
import {
	configureNotificationChannel,
	getNotificationStatus,
	toggleNotificationChannel,
} from "@/core/usecases/configureNotificationChannel";
import { notificationService } from "@/core/services/notificationService";
import { db } from "@/db/sqlite";

describe("Notification System", () => {
	const guildId = "guild_123";
	const channelId = "channel_456";
	const admin = createTestUser("admin_789");

	beforeEach(() => {
		// Clean up test database
		db.exec("DELETE FROM notification_channel_config");
	});

	describe("Channel Configuration", () => {
		it("should configure notification channel for first time", async () => {
			const result = await configureNotificationChannel({
				guildId,
				channelId,
				configuredBy: admin,
			});

			expect(result.success).toBe(true);
			expect(result.channelId).toBe(channelId);
			expect(result.previousChannelId).toBeUndefined();
			expect(result.message).toContain("konfiguriert");
		});

		it("should update existing notification channel", async () => {
			// Configure initial channel
			await configureNotificationChannel({
				guildId,
				channelId: "old_channel_123",
				configuredBy: admin,
			});

			// Update to new channel
			const result = await configureNotificationChannel({
				guildId,
				channelId,
				configuredBy: admin,
			});

			expect(result.success).toBe(true);
			expect(result.channelId).toBe(channelId);
			expect(result.previousChannelId).toBe("old_channel_123");
			expect(result.message).toContain("aktualisiert");
		});

		it("should get notification status when configured", async () => {
			await configureNotificationChannel({
				guildId,
				channelId,
				configuredBy: admin,
			});

			const status = await getNotificationStatus({ guildId });

			expect(status.configured).toBe(true);
			expect(status.enabled).toBe(true);
			expect(status.channelId).toBe(channelId);
			expect(status.configuredBy).toBe(admin.id);
		});

		it("should get notification status when not configured", async () => {
			const status = await getNotificationStatus({ guildId });

			expect(status.configured).toBe(false);
			expect(status.enabled).toBe(false);
			expect(status.channelId).toBeUndefined();
		});
	});

	describe("Toggle Functionality", () => {
		beforeEach(async () => {
			await configureNotificationChannel({
				guildId,
				channelId,
				configuredBy: admin,
			});
		});

		it("should disable notifications", async () => {
			const result = await toggleNotificationChannel({
				guildId,
				enabled: false,
				requestedBy: admin,
			});

			expect(result.success).toBe(true);
			expect(result.enabled).toBe(false);
			expect(result.message).toContain("deaktiviert");

			const status = await getNotificationStatus({ guildId });
			expect(status.enabled).toBe(false);
		});

		it("should enable notifications", async () => {
			// First disable
			await toggleNotificationChannel({
				guildId,
				enabled: false,
				requestedBy: admin,
			});

			// Then enable
			const result = await toggleNotificationChannel({
				guildId,
				enabled: true,
				requestedBy: admin,
			});

			expect(result.success).toBe(true);
			expect(result.enabled).toBe(true);
			expect(result.message).toContain("aktiviert");

			const status = await getNotificationStatus({ guildId });
			expect(status.enabled).toBe(true);
		});

		it("should fail to toggle when not configured", async () => {
			const result = await toggleNotificationChannel({
				guildId: "unconfigured_guild",
				enabled: true,
				requestedBy: admin,
			});

			expect(result.success).toBe(false);
			expect(result.message).toContain("Kein Notification-Channel konfiguriert");
		});
	});

	describe("Message Formatting", () => {
		it("should format trophy given message", () => {
			const event = {
				type: "trophy_given" as const,
				guildId,
				userId: "user_123",
				userName: "TestUser",
				points: 1,
				context: {
					recipientName: "Recipient",
					recipientId: "recipient_456",
					sourceType: "reaction" as const,
				},
			};

			const message = notificationService.formatNotificationMessage(event);
			expect(message).toBe("🏆 **TestUser** hat **Recipient** eine Trophäe spendiert (1 RP)");
		});

		it("should format daily bonus message", () => {
			const event = {
				type: "daily_bonus" as const,
				guildId,
				userId: "user_123",
				userName: "TestUser",
				points: 1,
				context: {
					sourceType: "daily" as const,
				},
			};

			const message = notificationService.formatNotificationMessage(event);
			expect(message).toBe("🌅 **TestUser** hat den Daily Bonus erhalten (1 RP)");
		});

		it("should format introduction post message", () => {
			const event = {
				type: "introduction_bonus" as const,
				guildId,
				userId: "user_123",
				userName: "TestUser",
				points: 5,
				context: {
					channelName: "introductions",
					sourceType: "post" as const,
				},
			};

			const message = notificationService.formatNotificationMessage(event);
			expect(message).toBe(
				"👋 **TestUser** hat 5 RP durch einen Vorstellungspost in **introductions** gesammelt"
			);
		});

		it("should format introduction reply message", () => {
			const event = {
				type: "introduction_bonus" as const,
				guildId,
				userId: "user_123",
				userName: "TestUser",
				points: 2,
				context: {
					sourceType: "reply" as const,
				},
			};

			const message = notificationService.formatNotificationMessage(event);
			expect(message).toBe("💬 **TestUser** hat 2 RP für eine Begrüßung gesammelt");
		});
	});

	describe("Notification Logic", () => {
		it("should return notification data when enabled", async () => {
			await configureNotificationChannel({
				guildId,
				channelId,
				configuredBy: admin,
			});

			const event = {
				type: "daily_bonus" as const,
				guildId,
				userId: "user_123",
				userName: "TestUser",
				points: 1,
			};

			const result = notificationService.notify(event);

			expect(result).not.toBeNull();
			expect(result?.channelId).toBe(channelId);
			expect(result?.message).toContain("TestUser");
		});

		it("should return null when notifications disabled", async () => {
			await configureNotificationChannel({
				guildId,
				channelId,
				configuredBy: admin,
			});

			await toggleNotificationChannel({
				guildId,
				enabled: false,
				requestedBy: admin,
			});

			const event = {
				type: "daily_bonus" as const,
				guildId,
				userId: "user_123",
				userName: "TestUser",
				points: 1,
			};

			const result = notificationService.notify(event);
			expect(result).toBeNull();
		});

		it("should return null when not configured", () => {
			const event = {
				type: "daily_bonus" as const,
				guildId: "unconfigured_guild",
				userId: "user_123",
				userName: "TestUser",
				points: 1,
			};

			const result = notificationService.notify(event);
			expect(result).toBeNull();
		});
	});
});
