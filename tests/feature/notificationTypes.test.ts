import { describe, it, expect } from "vitest";
import { notificationService } from "@/core/services/notificationService";

describe("New Notification Types", () => {
	describe("formatNotificationMessage", () => {
		it("should format rank promotion messages correctly", () => {
			const event = {
				type: "rank_promotion" as const,
				guildId: "guild_123",
				userId: "user_123",
				userName: "TestUser",
				points: 100,
				context: {
					previousRank: "Neuling",
					newRank: "Guide",
				},
			};

			const message = notificationService.formatNotificationMessage(event);
			expect(message).toContain("TestUser");
			expect(message).toContain("befördert");
			expect(message).toContain("Neuling → **Guide**");
			expect(message).toContain("100 RP");
		});

		it("should handle rank promotion with no previous rank", () => {
			const event = {
				type: "rank_promotion" as const,
				guildId: "guild_123",
				userId: "user_123",
				userName: "TestUser",
				points: 50,
				context: {
					previousRank: "Kein Rang",
					newRank: "Starter",
				},
			};

			const message = notificationService.formatNotificationMessage(event);
			expect(message).toContain("Kein Rang → **Starter**");
		});

		it("should format role error messages for permission issues", () => {
			const event = {
				type: "role_error" as const,
				guildId: "guild_123",
				userId: "admin",
				userName: "System",
				points: 0,
				context: {
					errorType: "permission",
					hint: "Verwende /manage-ranks validate",
				},
			};

			const message = notificationService.formatNotificationMessage(event);
			expect(message).toContain("Rollenfehler");
			expect(message).toContain("Bot fehlt 'Rollen verwalten' Berechtigung");
			expect(message).toContain("/manage-ranks validate");
		});

		it("should format role error messages for hierarchy issues", () => {
			const event = {
				type: "role_error" as const,
				guildId: "guild_123",
				userId: "admin",
				userName: "System",
				points: 0,
				context: {
					errorType: "hierarchy",
					affectedUser: "TestUser",
					hint: "Prüfe die Rollenhierarchie",
				},
			};

			const message = notificationService.formatNotificationMessage(event);
			expect(message).toContain("Rollenfehler");
			expect(message).toContain("Bot kann Rolle nicht verwalten (Hierarchie)");
			expect(message).toContain("TestUser");
			expect(message).toContain("Prüfe die Rollenhierarchie");
		});

		it("should format generic role error messages", () => {
			const event = {
				type: "role_error" as const,
				guildId: "guild_123",
				userId: "admin",
				userName: "System",
				points: 0,
				context: {
					error: "Custom error message",
					hint: "Try restarting",
				},
			};

			const message = notificationService.formatNotificationMessage(event);
			expect(message).toContain("Rollenfehler");
			expect(message).toContain("Custom error message");
			expect(message).toContain("Try restarting");
		});

		it("should format trophy given messages correctly", () => {
			const event = {
				type: "trophy_given" as const,
				guildId: "guild_123",
				userId: "giver_123",
				userName: "Giver",
				points: 1,
				context: {
					recipientName: "Recipient",
				},
			};

			const message = notificationService.formatNotificationMessage(event);
			expect(message).toContain("🏆");
			expect(message).toContain("Giver");
			expect(message).toContain("Recipient");
			expect(message).toContain("Trophäe spendiert");
			expect(message).toContain("1 RP");
		});
	});
});