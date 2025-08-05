import { db } from "@/db/sqlite";

interface UserInvite {
	guild_id: string;
	invite_code: string;
	creator_id: string;
	channel_id: string;
	created_at: string;
	expires_at: string | null;
	max_uses: number;
	current_uses: number;
	active: boolean;
}

interface InviteJoin {
	guild_id: string;
	invite_code: string;
	creator_id: string;
	joined_user_id: string;
	joined_at: string;
	rewarded: boolean;
	rewarded_at: string | null;
}

export const inviteTrackingService = {
	createInvite: (data: {
		guildId: string;
		inviteCode: string;
		creatorId: string;
		channelId: string;
		expiresAt?: string;
		maxUses?: number;
	}): boolean => {
		try {
			const stmt = db.prepare(`
				INSERT INTO user_invites (
					guild_id, invite_code, creator_id, channel_id, expires_at, max_uses
				) VALUES (?, ?, ?, ?, ?, ?)
			`);
			stmt.run(
				data.guildId,
				data.inviteCode,
				data.creatorId,
				data.channelId,
				data.expiresAt || null,
				data.maxUses || 1
			);
			return true;
		} catch (error) {
			console.error("Error creating invite:", error);
			return false;
		}
	},

	getUserInvites: (guildId: string, userId: string): UserInvite[] => {
		const stmt = db.prepare(`
			SELECT * FROM user_invites
			WHERE guild_id = ? AND creator_id = ? AND active = TRUE
			ORDER BY created_at DESC
		`);
		return stmt.all(guildId, userId) as UserInvite[];
	},

	getActiveInviteCount: (guildId: string, userId: string): number => {
		const stmt = db.prepare(`
			SELECT COUNT(*) as count FROM user_invites
			WHERE guild_id = ? AND creator_id = ? AND active = TRUE
		`);
		const result = stmt.get(guildId, userId) as { count: number };
		return result.count;
	},

	getInviteByCode: (guildId: string, inviteCode: string): UserInvite | null => {
		const stmt = db.prepare(`
			SELECT * FROM user_invites
			WHERE guild_id = ? AND invite_code = ? AND active = TRUE
		`);
		return (stmt.get(guildId, inviteCode) as UserInvite) || null;
	},

	incrementInviteUse: (guildId: string, inviteCode: string): boolean => {
		try {
			const stmt = db.prepare(`
				UPDATE user_invites
				SET current_uses = current_uses + 1
				WHERE guild_id = ? AND invite_code = ? AND active = TRUE
			`);
			const result = stmt.run(guildId, inviteCode);
			return result.changes > 0;
		} catch (error) {
			console.error("Error incrementing invite use:", error);
			return false;
		}
	},

	deactivateInvite: (guildId: string, inviteCode: string): boolean => {
		try {
			const stmt = db.prepare(`
				UPDATE user_invites
				SET active = FALSE
				WHERE guild_id = ? AND invite_code = ?
			`);
			const result = stmt.run(guildId, inviteCode);
			return result.changes > 0;
		} catch (error) {
			console.error("Error deactivating invite:", error);
			return false;
		}
	},

	deleteUserInvite: (guildId: string, inviteCode: string, userId: string): boolean => {
		try {
			const stmt = db.prepare(`
				UPDATE user_invites
				SET active = FALSE
				WHERE guild_id = ? AND invite_code = ? AND creator_id = ?
			`);
			const result = stmt.run(guildId, inviteCode, userId);
			return result.changes > 0;
		} catch (error) {
			console.error("Error deleting user invite:", error);
			return false;
		}
	},

	recordInviteJoin: (data: {
		guildId: string;
		inviteCode: string;
		creatorId: string;
		joinedUserId: string;
	}): boolean => {
		try {
			const stmt = db.prepare(`
				INSERT OR IGNORE INTO invite_joins (
					guild_id, invite_code, creator_id, joined_user_id
				) VALUES (?, ?, ?, ?)
			`);
			stmt.run(data.guildId, data.inviteCode, data.creatorId, data.joinedUserId);
			return true;
		} catch (error) {
			console.error("Error recording invite join:", error);
			return false;
		}
	},

	getPendingRewards: (guildId: string, creatorId?: string): InviteJoin[] => {
		let query = `
			SELECT * FROM invite_joins
			WHERE guild_id = ? AND rewarded = FALSE
		`;
		const params: any[] = [guildId];

		if (creatorId) {
			query += ` AND creator_id = ?`;
			params.push(creatorId);
		}

		query += ` ORDER BY joined_at DESC`;

		const stmt = db.prepare(query);
		return stmt.all(...params) as InviteJoin[];
	},

	markAsRewarded: (guildId: string, inviteCode: string, joinedUserId: string): boolean => {
		try {
			const stmt = db.prepare(`
				UPDATE invite_joins
				SET rewarded = TRUE, rewarded_at = CURRENT_TIMESTAMP
				WHERE guild_id = ? AND invite_code = ? AND joined_user_id = ?
			`);
			const result = stmt.run(guildId, inviteCode, joinedUserId);
			return result.changes > 0;
		} catch (error) {
			console.error("Error marking as rewarded:", error);
			return false;
		}
	},

	getUserInviteStats: (guildId: string, userId: string): {
		activeInvites: number;
		totalJoins: number;
		pendingRewards: number;
		totalRewards: number;
	} => {
		const activeInvites = inviteTrackingService.getActiveInviteCount(guildId, userId);
		
		const totalJoinsStmt = db.prepare(`
			SELECT COUNT(*) as count FROM invite_joins
			WHERE guild_id = ? AND creator_id = ?
		`);
		const totalJoins = (totalJoinsStmt.get(guildId, userId) as { count: number }).count;

		const pendingRewardsStmt = db.prepare(`
			SELECT COUNT(*) as count FROM invite_joins
			WHERE guild_id = ? AND creator_id = ? AND rewarded = FALSE
		`);
		const pendingRewards = (pendingRewardsStmt.get(guildId, userId) as { count: number }).count;

		const totalRewardsStmt = db.prepare(`
			SELECT COUNT(*) as count FROM invite_joins
			WHERE guild_id = ? AND creator_id = ? AND rewarded = TRUE
		`);
		const totalRewards = (totalRewardsStmt.get(guildId, userId) as { count: number }).count;

		return {
			activeInvites,
			totalJoins,
			pendingRewards,
			totalRewards,
		};
	},

	getAllActiveInvites: (guildId: string): UserInvite[] => {
		const stmt = db.prepare(`
			SELECT * FROM user_invites
			WHERE guild_id = ? AND active = TRUE
			ORDER BY created_at DESC
		`);
		return stmt.all(guildId) as UserInvite[];
	},

	cleanupExpiredInvites: (guildId: string): number => {
		try {
			const stmt = db.prepare(`
				UPDATE user_invites
				SET active = FALSE
				WHERE guild_id = ? AND active = TRUE 
				AND expires_at IS NOT NULL 
				AND datetime(expires_at) < datetime('now')
			`);
			const result = stmt.run(guildId);
			return result.changes;
		} catch (error) {
			console.error("Error cleaning up expired invites:", error);
			return 0;
		}
	},

	isInviteAtMaxUses: (guildId: string, inviteCode: string): boolean => {
		const stmt = db.prepare(`
			SELECT current_uses, max_uses FROM user_invites
			WHERE guild_id = ? AND invite_code = ? AND active = TRUE
		`);
		const result = stmt.get(guildId, inviteCode) as { current_uses: number; max_uses: number } | undefined;
		
		if (!result) return true; // Consider non-existent invites as "at max"
		return result.current_uses >= result.max_uses;
	},
};