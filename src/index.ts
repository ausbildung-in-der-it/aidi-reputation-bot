import 'dotenv/config';
import {Client, GatewayIntentBits, Partials} from 'discord.js';
import {onReactionAdd} from "@/bot/events/onReactionAdd";
import {onReactionRemove} from "@/bot/events/onReactionRemove";
import {onInteractionCreate} from "@/bot/events/onInteractionCreate";
import {registerSlashCommands} from "@/bot/commands/registerCommands";
import {closeDatabase} from "@/db/sqlite";

import "@/db/sqlite";

if (!process.env.DISCORD_TOKEN) {
    throw new Error('DISCORD_TOKEN is required');
}

if (!process.env.DISCORD_CLIENT_ID) {
    throw new Error('DISCORD_CLIENT_ID is required');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User
    ]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    await registerSlashCommands();
    
    // Setup cleanup job for rate limit entries (every 6 hours)
    setInterval(() => {
        try {
            const { rateLimitService } = require('@/core/services/rateLimitService');
            const cleaned = rateLimitService.cleanupOldEntries();
            if (cleaned > 0) {
                console.log(`Cleaned up ${cleaned} old rate limit entries`);
            }
        } catch (error) {
            console.error('Error during rate limit cleanup:', error);
        }
    }, 6 * 60 * 60 * 1000); // 6 hours
});

client.on('messageReactionAdd', async (reaction, user, _details) => {
    await onReactionAdd(reaction, user);
});

client.on('messageReactionRemove', async (reaction, user) => {
    await onReactionRemove(reaction, user);
});

client.on('interactionCreate', async (interaction) => {
    await onInteractionCreate(interaction);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    client.destroy();
    closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    client.destroy();
    closeDatabase();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);