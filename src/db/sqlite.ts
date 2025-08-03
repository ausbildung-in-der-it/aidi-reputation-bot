import Database from "better-sqlite3";
import { createTables } from "./schema";

// Use DATABASE_URL environment variable, fallback to ./data.db for production
const databaseUrl = process.env.DATABASE_URL || "./data.db";
export const db = new Database(databaseUrl);

export function closeDatabase() {
	db.close();
}

// Initialize database schema
createTables(db);
