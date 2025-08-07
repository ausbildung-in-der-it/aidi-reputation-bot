import { db } from "@/db/sqlite";

export interface NotificationEvent {
	type: "reputation_awarded" | "daily_bonus" | "introduction_bonus" | "trophy_given" | "invite_join" | "rank_promotion" | "role_error";
	guildId: string;
	userId: string;
	userName: string;
	points: number;
	context?: {
		channelName?: string;
		recipientName?: string;
		recipientId?: string;
		sourceType?: "reaction" | "post" | "reply" | "daily";
		inviteCode?: string;
		inviteCreatorName?: string;
		newRank?: string;
		previousRank?: string;
		errorType?: string;
		error?: string;
		affectedUser?: string;
		hint?: string;
	};
}

export interface NotificationChannelConfig {
	guildId: string;
	channelId: string;
	enabled: boolean;
	configuredBy: string;
	configuredAt: string;
}

export const notificationService = {
	getChannelConfig: (guildId: string): NotificationChannelConfig | null => {
		const stmt = db.prepare(`
            SELECT guild_id as guildId, channel_id as channelId, enabled, configured_by as configuredBy, configured_at as configuredAt
            FROM notification_channel_config
            WHERE guild_id = ?
        `);
		const result = stmt.get(guildId) as any;
		if (!result) {
			return null;
		}

		return {
			...result,
			enabled: Boolean(result.enabled),
		} as NotificationChannelConfig;
	},

	setChannelConfig: (config: {
		guildId: string;
		channelId: string;
		configuredBy: string;
		enabled?: boolean;
	}): void => {
		const transaction = db.transaction(() => {
			const stmt = db.prepare(`
                INSERT OR REPLACE INTO notification_channel_config (guild_id, channel_id, enabled, configured_by)
                VALUES (?, ?, ?, ?)
            `);
			stmt.run(config.guildId, config.channelId, (config.enabled ?? true) ? 1 : 0, config.configuredBy);
		});
		transaction();
	},

	toggleChannel: (guildId: string, enabled: boolean): boolean => {
		const transaction = db.transaction(() => {
			const stmt = db.prepare(`
                UPDATE notification_channel_config
                SET enabled = ?
                WHERE guild_id = ?
            `);
			const result = stmt.run(enabled ? 1 : 0, guildId);
			return result.changes > 0;
		});
		return transaction();
	},

	formatNotificationMessage: (event: NotificationEvent): string => {
		switch (event.type) {
			case "invite_join":
				const creatorText = event.context?.inviteCreatorName ? ` über Einladung von **${event.context.inviteCreatorName}**` : "";
				return `🎉 **${event.userName}** ist dem Server${creatorText} beigetreten!`;

			case "trophy_given":
				if (event.context?.recipientName) {
					return `🏆 **${event.userName}** hat **${event.context.recipientName}** eine Trophäe spendiert (${event.points} RP)`;
				}
				return `🏆 **${event.userName}** hat eine Trophäe vergeben (${event.points} RP)`;

			case "daily_bonus":
				return `🌅 **${event.userName}** hat den Daily Bonus erhalten (${event.points} RP)`;

			case "introduction_bonus":
				if (event.context?.sourceType === "post") {
					const channelText = event.context.channelName ? ` in **${event.context.channelName}**` : "";
					return `👋 **${event.userName}** hat ${event.points} RP durch einen Vorstellungspost${channelText} gesammelt`;
				}
				if (event.context?.sourceType === "reply") {
					return `💬 **${event.userName}** hat ${event.points} RP für eine Begrüßung gesammelt`;
				}
				return `👋 **${event.userName}** hat ${event.points} RP durch eine Vorstellung gesammelt`;

			case "rank_promotion":
				const prevRank = event.context?.previousRank || "Kein Rang";
				const newRank = event.context?.newRank || "Unbekannt";
				return `🎆 **${event.userName}** wurde befördert: ${prevRank} → **${newRank}** (${event.points} RP)`;

			case "role_error":
				if (event.context?.errorType === "permission") {
					return `⚠️ **Rollenfehler:** Bot fehlt 'Rollen verwalten' Berechtigung\n${event.context.hint || ""}`;
				}
				if (event.context?.errorType === "hierarchy") {
					return `⚠️ **Rollenfehler:** Bot kann Rolle nicht verwalten (Hierarchie)\nBetroffener User: ${event.context.affectedUser || "Unbekannt"}\n${event.context.hint || ""}`;
				}
				return `⚠️ **Rollenfehler:** ${event.context?.error || "Unbekannter Fehler"}\n${event.context?.hint || ""}`;

			case "reputation_awarded":
			default:
				const channelText = event.context?.channelName ? ` in **${event.context.channelName}**` : "";
				return `⭐ **${event.userName}** hat ${event.points} RP${channelText} gesammelt`;
		}
	},

	shouldNotify: (guildId: string): boolean => {
		const config = notificationService.getChannelConfig(guildId);
		return config !== null && config.enabled;
	},

	// This will be called by Discord layer to actually send the message
	notify: (event: NotificationEvent): { channelId: string; message: string } | null => {
		if (!notificationService.shouldNotify(event.guildId)) {
			return null;
		}

		const config = notificationService.getChannelConfig(event.guildId);
		if (!config) {
			return null;
		}

		const message = notificationService.formatNotificationMessage(event);
		return {
			channelId: config.channelId,
			message,
		};
	},
};
