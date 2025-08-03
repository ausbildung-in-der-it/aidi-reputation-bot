export interface EmojiConfig {
    emoji: string;
    points: number;
}

export const REPUTATION_EMOJIS: EmojiConfig[] = [
    { emoji: '🏆', points: 1 }
];

export interface RateLimitConfig {
    dailyLimit: number;        // Max awards per user per 24h
    perRecipientLimit: number; // Max awards to same recipient per 24h
    windowHours: number;       // Sliding window in hours
}

export const RATE_LIMIT_CONFIG: RateLimitConfig = {
    dailyLimit: 5,
    perRecipientLimit: 1,
    windowHours: 24
};

export function getEmojiPoints(emoji: string): number | null {
    const config = REPUTATION_EMOJIS.find(config => config.emoji === emoji);
    return config?.points ?? null;
}

export function isValidReputationEmoji(emoji: string): boolean {
    return getEmojiPoints(emoji) !== null;
}