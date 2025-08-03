declare global {
	namespace NodeJS {
		interface ProcessEnv {
			// Discord Bot Configuration
			DISCORD_TOKEN: string;
			DISCORD_CLIENT_ID: string;
			DISCORD_GUILD_ID?: string; // Optional for global commands

			// Database Configuration (if needed)
			DATABASE_URL?: string;

			// API Keys (add as needed)
			API_KEY?: string;

			// Environment
			NODE_ENV: "development" | "production" | "test";
		}
	}
}

export {};
