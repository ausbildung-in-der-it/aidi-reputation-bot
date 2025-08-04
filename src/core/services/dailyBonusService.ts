import { db } from "@/db/sqlite";
import { DAILY_BONUS_CONFIG, getCurrentDateInTimezone } from "@/config/reputation";

export interface DailyBonusCheck {
	canReceive: boolean;
	alreadyReceived: boolean;
	bonusDate: string;
}

export const dailyBonusService = {
	checkDailyBonus: (guildId: string, userId: string): DailyBonusCheck => {
		if (!DAILY_BONUS_CONFIG.enabled) {
			return {
				canReceive: false,
				alreadyReceived: false,
				bonusDate: getCurrentDateInTimezone(DAILY_BONUS_CONFIG.timezone),
			};
		}

		const bonusDate = getCurrentDateInTimezone(DAILY_BONUS_CONFIG.timezone);

		const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM daily_bonus_tracking
            WHERE guild_id = ? AND user_id = ? AND bonus_date = ?
        `);
		const result = stmt.get(guildId, userId, bonusDate) as { count: number };

		const alreadyReceived = result.count > 0;

		return {
			canReceive: !alreadyReceived,
			alreadyReceived,
			bonusDate,
		};
	},

	trackDailyBonus: (guildId: string, userId: string, bonusDate?: string): void => {
		const dateToTrack = bonusDate || getCurrentDateInTimezone(DAILY_BONUS_CONFIG.timezone);

		const transaction = db.transaction(() => {
			const stmt = db.prepare(`
                INSERT OR IGNORE INTO daily_bonus_tracking (guild_id, user_id, bonus_date)
                VALUES (?, ?, ?)
            `);
			stmt.run(guildId, userId, dateToTrack);
		});
		transaction();
	},

	getUserDailyBonusHistory: (guildId: string, userId: string, limitDays: number = 30) => {
		const stmt = db.prepare(`
            SELECT bonus_date, awarded_at
            FROM daily_bonus_tracking
            WHERE guild_id = ? AND user_id = ?
            ORDER BY bonus_date DESC
            LIMIT ?
        `);
		return stmt.all(guildId, userId, limitDays) as { bonus_date: string; awarded_at: string }[];
	},
};
