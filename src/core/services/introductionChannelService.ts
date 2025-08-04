import { db } from "@/db/sqlite";

export interface IntroductionChannelConfig {
	guildId: string;
	channelId: string;
	configuredBy: string;
	configuredAt: string;
}

export const introductionChannelService = {
	getChannelConfig: (guildId: string): IntroductionChannelConfig | null => {
		const stmt = db.prepare(`
            SELECT guild_id, channel_id, configured_by, configured_at
            FROM introduction_channel_config
            WHERE guild_id = ?
        `);
		const result = stmt.get(guildId) as any;
		if (!result) {
			return null;
		}
		
		return {
			guildId: result.guild_id,
			channelId: result.channel_id,
			configuredBy: result.configured_by,
			configuredAt: result.configured_at,
		};
	},

	setChannelConfig: (guildId: string, channelId: string, configuredBy: string): void => {
		const transaction = db.transaction(() => {
			const stmt = db.prepare(`
                INSERT OR REPLACE INTO introduction_channel_config 
                (guild_id, channel_id, configured_by, configured_at)
                VALUES (?, ?, ?, ?)
            `);
			stmt.run(guildId, channelId, configuredBy, new Date().toISOString());
		});
		transaction();
	},

	removeChannelConfig: (guildId: string): boolean => {
		const stmt = db.prepare(`
            DELETE FROM introduction_channel_config
            WHERE guild_id = ?
        `);
		const result = stmt.run(guildId);
		return result.changes > 0;
	},

	isIntroductionChannel: (guildId: string, channelId: string): boolean => {
		const config = introductionChannelService.getChannelConfig(guildId);
		return config?.channelId === channelId;
	},

	getAllConfigs: (): IntroductionChannelConfig[] => {
		const stmt = db.prepare(`
            SELECT guild_id, channel_id, configured_by, configured_at
            FROM introduction_channel_config
            ORDER BY configured_at DESC
        `);
		const results = stmt.all() as any[];
		return results.map(result => ({
			guildId: result.guild_id,
			channelId: result.channel_id,
			configuredBy: result.configured_by,
			configuredAt: result.configured_at,
		}));
	},
};