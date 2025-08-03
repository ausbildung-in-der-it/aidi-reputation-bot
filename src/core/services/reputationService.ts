import { db } from "@/db/sqlite";

export const reputationService = {
	getUserReputation: (guildId: string, userId: string): number => {
		const stmt = db.prepare(`
            SELECT SUM(amount) as total
            FROM reputation_events
            WHERE guild_id = ? AND to_user_id = ?
        `);
		const result = stmt.get(guildId, userId) as { total: number | null };
		return result?.total || 0;
	},

	getGuildLeaderboard: (guildId: string, limit: number = 10) => {
		const stmt = db.prepare(`
            SELECT to_user_id, SUM(amount) as total
            FROM reputation_events
            WHERE guild_id = ?
            GROUP BY to_user_id
            ORDER BY total DESC
            LIMIT ?
        `);
		return stmt.all(guildId, limit) as { to_user_id: string; total: number }[];
	},

	trackReputationReaction: (input: {
		guildId: string;
		messageId: string;
		toUserId: string;
		fromUserId: string;
		emoji: string;
		amount: number;
	}) => {
		const transaction = db.transaction(() => {
			const stmt = db.prepare(`
        INSERT OR IGNORE INTO reputation_events (
          guild_id, message_id, to_user_id, from_user_id, emoji, amount
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
			stmt.run(input.guildId, input.messageId, input.toUserId, input.fromUserId, input.emoji, input.amount);
		});
		transaction();
	},

	removeReputationReaction: (guildId: string, messageId: string, fromUserId: string, emoji: string) => {
		const transaction = db.transaction(() => {
			const stmt = db.prepare(`
        DELETE FROM reputation_events
        WHERE guild_id = ? AND message_id = ? AND from_user_id = ? AND emoji = ?
      `);
			stmt.run(guildId, messageId, fromUserId, emoji);
		});
		transaction();
	},

	hasUserReceivedBonus: (guildId: string, userId: string, emojis: string[]): boolean => {
		const placeholders = emojis.map(() => "?").join(",");
		const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM reputation_events
            WHERE guild_id = ? AND to_user_id = ? AND emoji IN (${placeholders})
        `);
		const result = stmt.get(guildId, userId, ...emojis) as { count: number };
		return result.count > 0;
	},
};
