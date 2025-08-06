import { db } from "@/db/sqlite";

export const leaderboardExclusionService = {
	addExcludedRole: (guildId: string, roleId: string, configuredBy: string): boolean => {
		try {
			const stmt = db.prepare(`
				INSERT OR REPLACE INTO leaderboard_excluded_roles (guild_id, role_id, configured_by)
				VALUES (?, ?, ?)
			`);
			stmt.run(guildId, roleId, configuredBy);
			return true;
		} catch (error) {
			console.error("Error adding excluded role:", error);
			return false;
		}
	},

	removeExcludedRole: (guildId: string, roleId: string): boolean => {
		try {
			const stmt = db.prepare(`
				DELETE FROM leaderboard_excluded_roles
				WHERE guild_id = ? AND role_id = ?
			`);
			const result = stmt.run(guildId, roleId);
			return result.changes > 0;
		} catch (error) {
			console.error("Error removing excluded role:", error);
			return false;
		}
	},

	getExcludedRoles: (guildId: string): { roleId: string; configuredBy: string; configuredAt: string }[] => {
		try {
			const stmt = db.prepare(`
				SELECT role_id as roleId, configured_by as configuredBy, configured_at as configuredAt
				FROM leaderboard_excluded_roles
				WHERE guild_id = ?
				ORDER BY configured_at DESC
			`);
			return stmt.all(guildId) as { roleId: string; configuredBy: string; configuredAt: string }[];
		} catch (error) {
			console.error("Error getting excluded roles:", error);
			return [];
		}
	},

	isRoleExcluded: (guildId: string, roleId: string): boolean => {
		try {
			const stmt = db.prepare(`
				SELECT COUNT(*) as count
				FROM leaderboard_excluded_roles
				WHERE guild_id = ? AND role_id = ?
			`);
			const result = stmt.get(guildId, roleId) as { count: number | bigint };
			return Number(result.count) > 0;
		} catch (error) {
			console.error("Error checking if role is excluded:", error);
			return false;
		}
	},

	getExcludedRoleIds: (guildId: string): string[] => {
		try {
			const stmt = db.prepare(`
				SELECT role_id
				FROM leaderboard_excluded_roles
				WHERE guild_id = ?
			`);
			const results = stmt.all(guildId) as { role_id: string }[];
			return results.map(r => r.role_id);
		} catch (error) {
			console.error("Error getting excluded role IDs:", error);
			return [];
		}
	},
};