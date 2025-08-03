import Database from "better-sqlite3";

/**
 * Creates the database schema tables for the reputation bot.
 * This function is shared between production and test environments.
 */
export function createTables(db: Database.Database): void {
	db.exec(`
    CREATE TABLE IF NOT EXISTS reputation_events (
      guild_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, message_id, from_user_id)
    );
  `);

	db.exec(`
    CREATE TABLE IF NOT EXISTS reputation_rate_limits (
      guild_id TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, from_user_id, to_user_id, awarded_at)
    );
  `);

	db.exec(`
    CREATE TABLE IF NOT EXISTS daily_bonus_tracking (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      bonus_date TEXT NOT NULL,
      awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, user_id, bonus_date)
    );
  `);

	db.exec(`
    CREATE TABLE IF NOT EXISTS introduction_channel_config (
      guild_id TEXT NOT NULL PRIMARY KEY,
      channel_id TEXT NOT NULL,
      configured_by TEXT NOT NULL,
      configured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

	db.exec(`
    CREATE TABLE IF NOT EXISTS introduction_reply_tracking (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      original_message_id TEXT NOT NULL,
      replied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, user_id, original_message_id)
    );
  `);
}