import Database from 'better-sqlite3';

export const db = new Database('./data.db');


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

