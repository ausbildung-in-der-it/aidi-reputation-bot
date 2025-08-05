import { db } from "@/db/sqlite";

export interface InviteChannelConfig {
	guildId: string;
	channelId: string;
	configuredBy: string;
	configuredAt: string;
}

export const inviteChannelService = {
	getChannelConfig: (guildId: string): InviteChannelConfig | null => {
		const stmt = db.prepare(`
            SELECT guild_id as guildId, channel_id as channelId, configured_by as configuredBy, configured_at as configuredAt
            FROM invite_channel_config
            WHERE guild_id = ?
        `);
		const result = stmt.get(guildId) as InviteChannelConfig | undefined;
		return result ?? null;
	},

	setChannelConfig: (config: {
		guildId: string;
		channelId: string;
		configuredBy: string;
	}): void => {
		const transaction = db.transaction(() => {
			const stmt = db.prepare(`
                INSERT OR REPLACE INTO invite_channel_config (guild_id, channel_id, configured_by)
                VALUES (?, ?, ?)
            `);
			stmt.run(config.guildId, config.channelId, config.configuredBy);
		});
		transaction();
	},

	removeChannelConfig: (guildId: string): boolean => {
		const transaction = db.transaction(() => {
			const stmt = db.prepare(`
                DELETE FROM invite_channel_config
                WHERE guild_id = ?
            `);
			const result = stmt.run(guildId);
			return result.changes > 0;
		});
		return transaction();
	},

	hasChannelConfig: (guildId: string): boolean => {
		return inviteChannelService.getChannelConfig(guildId) !== null;
	},
};