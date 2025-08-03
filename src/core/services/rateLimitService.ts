import { db } from '@/db/sqlite';
import { RATE_LIMIT_CONFIG } from '@/config/reputation';

export interface RateLimitCheck {
    allowed: boolean;
    reason?: string;
    dailyUsed?: number;
    dailyLimit?: number;
}

export const rateLimitService = {
    checkLimits: (guildId: string, fromUserId: string, toUserId: string): RateLimitCheck => {
        const { dailyLimit, perRecipientLimit, windowHours } = RATE_LIMIT_CONFIG;
        const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

        // Check daily limit
        const dailyCountStmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM reputation_rate_limits
            WHERE guild_id = ? AND from_user_id = ? AND awarded_at > ?
        `);
        const dailyResult = dailyCountStmt.get(guildId, fromUserId, windowStart) as { count: number };
        
        if (dailyResult.count >= dailyLimit) {
            return {
                allowed: false,
                reason: `Daily limit reached (${dailyLimit}/${windowHours}h)`,
                dailyUsed: dailyResult.count,
                dailyLimit: dailyLimit
            };
        }

        // Check per-recipient limit
        const recipientCountStmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM reputation_rate_limits
            WHERE guild_id = ? AND from_user_id = ? AND to_user_id = ? AND awarded_at > ?
        `);
        const recipientResult = recipientCountStmt.get(guildId, fromUserId, toUserId, windowStart) as { count: number };
        
        if (recipientResult.count >= perRecipientLimit) {
            return {
                allowed: false,
                reason: `Already awarded to this user in ${windowHours}h window`,
                dailyUsed: dailyResult.count,
                dailyLimit: dailyLimit
            };
        }

        return {
            allowed: true,
            dailyUsed: dailyResult.count,
            dailyLimit: dailyLimit
        };
    },

    recordAward: (guildId: string, fromUserId: string, toUserId: string): void => {
        const transaction = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO reputation_rate_limits (guild_id, from_user_id, to_user_id, awarded_at)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run(guildId, fromUserId, toUserId, new Date().toISOString());
        });
        transaction();
    },

    cleanupOldEntries: (): number => {
        const { windowHours } = RATE_LIMIT_CONFIG;
        const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
        
        const stmt = db.prepare(`
            DELETE FROM reputation_rate_limits
            WHERE awarded_at <= ?
        `);
        const result = stmt.run(cutoffTime);
        return result.changes;
    }
};