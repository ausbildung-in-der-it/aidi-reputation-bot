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

	getGuildLeaderboardWithExclusions: (guildId: string, limit: number = 10, excludedRoleIds: string[]) => {
		if (excludedRoleIds.length === 0) {
			return reputationService.getGuildLeaderboard(guildId, limit);
		}

		const stmt = db.prepare(`
            SELECT to_user_id, SUM(amount) as total
            FROM reputation_events
            WHERE guild_id = ?
            GROUP BY to_user_id
            ORDER BY total DESC
        `);
		const allResults = stmt.all(guildId) as { to_user_id: string; total: number }[];
		
		return allResults.slice(0, limit);
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

	getAllUsersWithRP: (guildId: string): { userId: string; totalRp: number }[] => {
		const stmt = db.prepare(`
            SELECT to_user_id as userId, SUM(amount) as totalRp
            FROM reputation_events
            WHERE guild_id = ?
            GROUP BY to_user_id
            HAVING totalRp > 0
            ORDER BY totalRp DESC
        `);
		return stmt.all(guildId) as { userId: string; totalRp: number }[];
	},

	getUserReputationEvents: (
		guildId: string, 
		userId: string, 
		limit: number = 20, 
		type: 'received' | 'given' | 'all' = 'all'
	): Array<{
		message_id: string;
		to_user_id: string;
		from_user_id: string;
		emoji: string;
		amount: number;
		created_at: string;
		event_type: 'received' | 'given';
	}> => {
		let query = '';
		let params: any[] = [guildId];

		if (type === 'received') {
			query = `
				SELECT message_id, to_user_id, from_user_id, emoji, amount, created_at, 'received' as event_type
				FROM reputation_events
				WHERE guild_id = ? AND to_user_id = ?
				ORDER BY created_at DESC
				LIMIT ?
			`;
			params.push(userId, limit);
		} else if (type === 'given') {
			query = `
				SELECT message_id, to_user_id, from_user_id, emoji, amount, created_at, 'given' as event_type
				FROM reputation_events
				WHERE guild_id = ? AND from_user_id = ?
				ORDER BY created_at DESC
				LIMIT ?
			`;
			params.push(userId, limit);
		} else {
			query = `
				SELECT message_id, to_user_id, from_user_id, emoji, amount, created_at,
					CASE 
						WHEN to_user_id = ? THEN 'received'
						ELSE 'given'
					END as event_type
				FROM reputation_events
				WHERE guild_id = ? AND (to_user_id = ? OR from_user_id = ?)
				ORDER BY created_at DESC
				LIMIT ?
			`;
			params = [userId, guildId, userId, userId, limit];
		}

		const stmt = db.prepare(query);
		return stmt.all(...params) as Array<{
			message_id: string;
			to_user_id: string;
			from_user_id: string;
			emoji: string;
			amount: number;
			created_at: string;
			event_type: 'received' | 'given';
		}>;
	},
};
