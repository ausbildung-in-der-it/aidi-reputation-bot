import Database from "better-sqlite3";

export function createTestDatabase(): Database.Database {
	// Create in-memory database for tests
	const db = new Database(":memory:");

	// Create the same tables as production
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

	return db;
}

export function cleanupTestDatabase(db: Database.Database): void {
	db.exec("DELETE FROM reputation_events");
	db.exec("DELETE FROM reputation_rate_limits");
}
