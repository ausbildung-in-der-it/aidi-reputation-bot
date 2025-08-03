export interface EmojiConfig {
    emoji: string;
    points: number;
}

export const REPUTATION_EMOJIS: EmojiConfig[] = [
    { emoji: '🏆', points: 1 }
];

export function getEmojiPoints(emoji: string): number | null {
    const config = REPUTATION_EMOJIS.find(config => config.emoji === emoji);
    return config?.points ?? null;
}

export function isValidReputationEmoji(emoji: string): boolean {
    return getEmojiPoints(emoji) !== null;
}