import { db } from "@/db/sqlite";
import { INTRODUCTION_CONFIG } from "@/config/reputation";

export interface ReplyLimitCheck {
	canReply: boolean;
	reason?: string;
	repliesUsed: number;
	maxReplies: number;
	alreadyRepliedToThisPost: boolean;
}

export interface ReplyTrackingEntry {
	guildId: string;
	userId: string;
	originalMessageId: string;
	repliedAt: string;
}

export const introductionReplyService = {
	checkReplyLimits: (guildId: string, userId: string, originalMessageId: string): ReplyLimitCheck => {
		const maxReplies = INTRODUCTION_CONFIG.maxRepliesPerUser;
		const windowHours = INTRODUCTION_CONFIG.replyWindowHours;
		const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

		// Check if user already replied to this specific post (within the window)
		const specificReplyStmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM introduction_reply_tracking
            WHERE guild_id = ? AND user_id = ? AND original_message_id = ? AND replied_at > ?
        `);
		const specificReplyResult = specificReplyStmt.get(guildId, userId, originalMessageId, windowStart) as { count: number | bigint };
		const specificReplyCount = Number(specificReplyResult.count);
		const alreadyRepliedToThisPost = specificReplyCount > 0;

		if (alreadyRepliedToThisPost) {
			return {
				canReply: false,
				reason: "Already replied to this introduction post",
				repliesUsed: 0, // Will be calculated below
				maxReplies,
				alreadyRepliedToThisPost: true,
			};
		}

		// Check total replies by this user within the time window
		const totalRepliesStmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM introduction_reply_tracking
            WHERE guild_id = ? AND user_id = ? AND replied_at > ?
        `);
		const totalRepliesResult = totalRepliesStmt.get(guildId, userId, windowStart) as { count: number | bigint };
		const repliesUsed = Number(totalRepliesResult.count);

		if (repliesUsed >= maxReplies) {
			return {
				canReply: false,
				reason: `Daily reply limit reached (${maxReplies}/${windowHours}h)`,
				repliesUsed,
				maxReplies,
				alreadyRepliedToThisPost: false,
			};
		}

		return {
			canReply: true,
			repliesUsed,
			maxReplies,
			alreadyRepliedToThisPost: false,
		};
	},

	trackReply: (guildId: string, userId: string, originalMessageId: string): void => {
		const transaction = db.transaction(() => {
			const stmt = db.prepare(`
                INSERT OR IGNORE INTO introduction_reply_tracking 
                (guild_id, user_id, original_message_id, replied_at)
                VALUES (?, ?, ?, ?)
            `);
			stmt.run(guildId, userId, originalMessageId, new Date().toISOString());
		});
		transaction();
	},

	getUserReplyHistory: (guildId: string, userId: string): ReplyTrackingEntry[] => {
		const stmt = db.prepare(`
            SELECT guild_id, user_id, original_message_id, replied_at
            FROM introduction_reply_tracking
            WHERE guild_id = ? AND user_id = ?
            ORDER BY replied_at DESC
        `);
		const results = stmt.all(guildId, userId) as any[];
		return results.map(result => ({
			guildId: result.guild_id,
			userId: result.user_id,
			originalMessageId: result.original_message_id,
			repliedAt: result.replied_at,
		}));
	},

	getPostReplies: (guildId: string, originalMessageId: string): ReplyTrackingEntry[] => {
		const stmt = db.prepare(`
            SELECT guild_id, user_id, original_message_id, replied_at
            FROM introduction_reply_tracking
            WHERE guild_id = ? AND original_message_id = ?
            ORDER BY replied_at ASC
        `);
		const results = stmt.all(guildId, originalMessageId) as any[];
		return results.map(result => ({
			guildId: result.guild_id,
			userId: result.user_id,
			originalMessageId: result.original_message_id,
			repliedAt: result.replied_at,
		}));
	},

	cleanupOldEntries: (daysCutoff: number = 90): number => {
		const cutoffTime = new Date(Date.now() - daysCutoff * 24 * 60 * 60 * 1000).toISOString();

		const stmt = db.prepare(`
            DELETE FROM introduction_reply_tracking
            WHERE replied_at <= ?
        `);
		const result = stmt.run(cutoffTime);
		return result.changes;
	},
};
