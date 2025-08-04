import { db } from "@/db/sqlite";

export interface ReputationRank {
	guildId: string;
	rankName: string;
	requiredRp: number;
	roleId: string;
	createdAt: string;
}

export interface RankUpdateResult {
	success: boolean;
	updated: boolean;
	previousRank?: ReputationRank | null;
	newRank?: ReputationRank | null;
	error?: string;
}

export const roleManagementService = {
	/**
	 * Get all ranks for a guild, sorted by required RP (ascending)
	 */
	getRanksForGuild: (guildId: string): ReputationRank[] => {
		const stmt = db.prepare(`
            SELECT guild_id, rank_name, required_rp, role_id, created_at
            FROM reputation_ranks
            WHERE guild_id = ?
            ORDER BY required_rp ASC
        `);
		const results = stmt.all(guildId) as any[];
		return results.map(result => ({
			guildId: result.guild_id,
			rankName: result.rank_name,
			requiredRp: result.required_rp,
			roleId: result.role_id,
			createdAt: result.created_at,
		}));
	},

	/**
	 * Get the highest rank a user is eligible for based on their RP
	 */
	getUserEligibleRank: (guildId: string, userRp: number): ReputationRank | null => {
		const ranks = roleManagementService.getRanksForGuild(guildId);

		// Find the highest rank the user qualifies for
		let eligibleRank: ReputationRank | null = null;
		for (const rank of ranks) {
			if (userRp >= rank.requiredRp) {
				eligibleRank = rank;
			} else {
				break; // Since ranks are sorted by required_rp ASC
			}
		}

		return eligibleRank;
	},

	/**
	 * Add a new rank to a guild
	 */
	addRank: (guildId: string, rankName: string, requiredRp: number, roleId: string): boolean => {
		try {
			const transaction = db.transaction(() => {
				const stmt = db.prepare(`
                    INSERT OR REPLACE INTO reputation_ranks 
                    (guild_id, rank_name, required_rp, role_id, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `);
				stmt.run(guildId, rankName, requiredRp, roleId, new Date().toISOString());
			});
			transaction();
			return true;
		} catch (error) {
			console.error("Error adding rank:", error);
			return false;
		}
	},

	/**
	 * Remove a rank from a guild
	 */
	removeRank: (guildId: string, rankName: string): boolean => {
		try {
			const stmt = db.prepare(`
                DELETE FROM reputation_ranks
                WHERE guild_id = ? AND rank_name = ?
            `);
			const result = stmt.run(guildId, rankName);
			return result.changes > 0;
		} catch (error) {
			console.error("Error removing rank:", error);
			return false;
		}
	},

	/**
	 * Check if a user needs a rank update and return the result
	 * This function only determines what the rank should be, doesn't modify Discord roles
	 */
	checkUserRankUpdate: (guildId: string, currentRp: number): RankUpdateResult => {
		try {
			const newRank = roleManagementService.getUserEligibleRank(guildId, currentRp);

			return {
				success: true,
				updated: true, // Let the caller determine if Discord roles need updating
				newRank,
				previousRank: null, // We don't track previous ranks in this service
			};
		} catch (error) {
			console.error("Error checking user rank update:", error);
			return {
				success: false,
				updated: false,
				error: "Failed to check rank update",
			};
		}
	},

	/**
	 * Get rank by name
	 */
	getRankByName: (guildId: string, rankName: string): ReputationRank | null => {
		const stmt = db.prepare(`
            SELECT guild_id, rank_name, required_rp, role_id, created_at
            FROM reputation_ranks
            WHERE guild_id = ? AND rank_name = ?
        `);
		const result = stmt.get(guildId, rankName) as any;

		if (!result) {
			return null;
		}

		return {
			guildId: result.guild_id,
			rankName: result.rank_name,
			requiredRp: result.required_rp,
			roleId: result.role_id,
			createdAt: result.created_at,
		};
	},

	/**
	 * Check if a rank exists
	 */
	rankExists: (guildId: string, rankName: string): boolean => {
		const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM reputation_ranks
            WHERE guild_id = ? AND rank_name = ?
        `);
		const result = stmt.get(guildId, rankName) as { count: number };
		return result.count > 0;
	},
};
