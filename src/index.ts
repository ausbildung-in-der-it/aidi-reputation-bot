// Configure module alias for development vs production
if (process.env.NODE_ENV !== "production") {
	require("module-alias").addAlias("@", __dirname);
} else {
	require("module-alias/register");
}
import "dotenv/config";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { onReactionAdd } from "@/bot/events/onReactionAdd";
import { onReactionRemove } from "@/bot/events/onReactionRemove";
import { onInteractionCreate } from "@/bot/events/onInteractionCreate";
import { onMessageCreate } from "@/bot/events/onMessageCreate";
import { onGuildMemberAdd } from "@/bot/events/onGuildMemberAdd";
import { registerSlashCommands } from "@/bot/commands/registerCommands";
import { closeDatabase } from "@/db/sqlite";
import { initializeDiscordNotificationService } from "@/bot/services/discordNotificationService";

import "@/db/sqlite";

if (!process.env.DISCORD_TOKEN) {
	throw new Error("DISCORD_TOKEN is required");
}

if (!process.env.DISCORD_CLIENT_ID) {
	throw new Error("DISCORD_CLIENT_ID is required");
}

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildInvites,
	],
	partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

client.once("ready", async () => {
	console.log(`Logged in as ${client.user?.tag}!`);
	await registerSlashCommands();

	// Initialize notification service
	initializeDiscordNotificationService(client);

	// Setup cleanup job for rate limit entries (every 6 hours)
	setInterval(
		() => {
			try {
				const { rateLimitService } = require("@/core/services/rateLimitService");
				const { introductionReplyService } = require("@/core/services/introductionReplyService");
				
				// Clean rate limits
				const cleanedRateLimits = rateLimitService.cleanupOldEntries();
				if (cleanedRateLimits > 0) {
					console.log(`Cleaned up ${cleanedRateLimits} old rate limit entries`);
				}
				
				// Clean introduction reply tracking (keep 7 days for audit)
				const cleanedReplies = introductionReplyService.cleanupOldEntries(7);
				if (cleanedReplies > 0) {
					console.log(`Cleaned up ${cleanedReplies} old introduction reply entries`);
				}
			} catch (error) {
				console.error("Error during cleanup:", error);
			}
		},
		6 * 60 * 60 * 1000
	); // 6 hours
});

client.on("messageReactionAdd", async (reaction, user, _details) => {
	await onReactionAdd(reaction, user);
});

client.on("messageReactionRemove", async (reaction, user) => {
	await onReactionRemove(reaction, user);
});

client.on("interactionCreate", async interaction => {
	await onInteractionCreate(interaction);
});

client.on("messageCreate", async message => {
	await onMessageCreate(message);
});

client.on("guildMemberAdd", async member => {
	await onGuildMemberAdd(member);
});

// Graceful shutdown
process.on("SIGINT", () => {
	console.log("Received SIGINT, shutting down gracefully...");
	client.destroy();
	closeDatabase();
	process.exit(0);
});

process.on("SIGTERM", () => {
	console.log("Received SIGTERM, shutting down gracefully...");
	client.destroy();
	closeDatabase();
	process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
