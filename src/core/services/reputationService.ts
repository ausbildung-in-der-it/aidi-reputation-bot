import { db } from '@/db/sqlite';

export const reputationService = {
    givePoint: (guildId: string, toUserId: string) => {
        const stmt = db.prepare(`
      INSERT INTO reputation (guild_id, user_id, points)
      VALUES (?, ?, 1)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET points = points + 1
    `);
        stmt.run(guildId, toUserId);
    },

    trackReputationReaction: (input: {
        guildId: string;
        messageId: string;
        toUserId: string;
        fromUserId: string;
        emoji: string;
        amount: number;
    }) => {
        const stmt = db.prepare(`
      INSERT OR IGNORE INTO reputation_events (
        guild_id, message_id, to_user_id, from_user_id, emoji, amount
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
        stmt.run(
            input.guildId,
            input.messageId,
            input.toUserId,
            input.fromUserId,
            input.emoji,
            input.amount
        );
    },

    removeReputationReaction: (guildId: string, messageId: string, fromUserId: string) => {
        const stmt = db.prepare(`
      DELETE FROM reputation_events
      WHERE guild_id = ? AND message_id = ? AND from_user_id = ?
    `);
        stmt.run(guildId, messageId, fromUserId);
    }
};
