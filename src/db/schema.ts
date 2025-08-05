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

	db.exec(`
    CREATE TABLE IF NOT EXISTS reputation_ranks (
      guild_id TEXT NOT NULL,
      rank_name TEXT NOT NULL,
      required_rp INTEGER NOT NULL,
      role_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, rank_name)
    );
  `);

	db.exec(`
    CREATE TABLE IF NOT EXISTS notification_channel_config (
      guild_id TEXT NOT NULL PRIMARY KEY,
      channel_id TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT 1,
      configured_by TEXT NOT NULL,
      configured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

	db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_excluded_roles (
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      configured_by TEXT NOT NULL,
      configured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, role_id)
    );
  `);

	db.exec(`
    CREATE TABLE IF NOT EXISTS user_invites (
      guild_id TEXT NOT NULL,
      invite_code TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      max_uses INTEGER DEFAULT 1,
      current_uses INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      PRIMARY KEY (guild_id, invite_code)
    );
  `);

	db.exec(`
    CREATE TABLE IF NOT EXISTS invite_joins (
      guild_id TEXT NOT NULL,
      invite_code TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      joined_user_id TEXT NOT NULL,
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      rewarded BOOLEAN DEFAULT FALSE,
      rewarded_at TEXT,
      PRIMARY KEY (guild_id, invite_code, joined_user_id)
    );
  `);
}
