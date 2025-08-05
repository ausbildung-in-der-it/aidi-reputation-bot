import Database from "better-sqlite3";
import { createTables } from "./schema";

// Use DATABASE_URL environment variable, fallback to ./data.db for production
const databaseUrl = process.env.DATABASE_URL || "./data.db";
export const db = new Database(databaseUrl);

// Configure SQLite for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 30000'); // 30 seconds
db.pragma('foreign_keys = ON');
db.defaultSafeIntegers(true);

export function closeDatabase() {
	db.close();
}

// Initialize database schema
createTables(db);
