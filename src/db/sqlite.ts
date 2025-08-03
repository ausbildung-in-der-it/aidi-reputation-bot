import Database from "better-sqlite3";

export const db = new Database("./data.db");

export function closeDatabase() {
	db.close();
}

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
