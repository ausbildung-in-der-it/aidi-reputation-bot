import 'dotenv/config';
import {Client, GatewayIntentBits, Partials} from 'discord.js';
import {onReactionAdd} from "@/bot/events/onReactionAdd";
import {onReactionRemove} from "@/bot/events/onReactionRemove";

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

client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
});

client.on('messageReactionAdd', async (reaction, user, _details) => {
    await onReactionAdd(reaction, user);
});

client.on('messageReactionRemove', async (reaction, user) => {
    await onReactionRemove(reaction, user);
});

client.login(process.env.DISCORD_TOKEN);