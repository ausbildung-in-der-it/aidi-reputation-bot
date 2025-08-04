import { ChatInputCommandInteraction } from "discord.js";
import { CommandHandler, safeErrorReply } from "./interactionWrapper";

interface RateLimitConfig {
	maxPerMinute?: number;
	maxPerHour?: number;
	cooldownSeconds?: number;
}

interface RateLimitEntry {
	count: number;
	resetTime: number;
	lastCommand: number;
}

// In-memory rate limiting (could be moved to database if needed across restarts)
const rateLimits = new Map<string, RateLimitEntry>();

/**
 * Default rate limit configurations per command type
 */
const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
	// User-facing commands with higher limits
	"reputation": { maxPerMinute: 10, cooldownSeconds: 2 },
	"leaderboard": { maxPerMinute: 5, cooldownSeconds: 5 },
	"rate-limits": { maxPerMinute: 10, cooldownSeconds: 2 },
	
	// Admin commands with lower limits (more resource intensive)
	"award-rp": { maxPerMinute: 20, cooldownSeconds: 1 },
	"manage-ranks": { maxPerMinute: 5, cooldownSeconds: 10 },
	"leaderboard-exclusions": { maxPerMinute: 10, cooldownSeconds: 3 },
	"set-introduction-channel": { maxPerMinute: 5, cooldownSeconds: 5 },
	"notification-channel": { maxPerMinute: 5, cooldownSeconds: 5 },
};

/**
 * Get rate limit key for user+command combination
 */
function getRateLimitKey(userId: string, commandName: string): string {
	return `${userId}:${commandName}`;
}

/**
 * Check if user is rate limited for a specific command
 */
function isRateLimited(userId: string, commandName: string, config: RateLimitConfig): boolean {
	const key = getRateLimitKey(userId, commandName);
	const now = Date.now();
	const entry = rateLimits.get(key);
	
	if (!entry) {
		return false;
	}
	
	// Check cooldown
	if (config.cooldownSeconds && (now - entry.lastCommand) < (config.cooldownSeconds * 1000)) {
		return true;
	}
	
	// Check minute limit
	if (config.maxPerMinute && entry.resetTime > now && entry.count >= config.maxPerMinute) {
		return true;
	}
	
	return false;
}

/**
 * Track command usage for rate limiting
 */
function trackCommandUsage(userId: string, commandName: string, _config: RateLimitConfig): void {
	const key = getRateLimitKey(userId, commandName);
	const now = Date.now();
	const windowMs = 60 * 1000; // 1 minute window
	
	let entry = rateLimits.get(key);
	
	if (!entry || entry.resetTime <= now) {
		// Create new entry or reset expired one
		entry = {
			count: 1,
			resetTime: now + windowMs,
			lastCommand: now
		};
	} else {
		// Increment existing entry
		entry.count++;
		entry.lastCommand = now;
	}
	
	rateLimits.set(key, entry);
}

/**
 * Get remaining time until rate limit resets
 */
function getRemainingCooldown(userId: string, commandName: string, config: RateLimitConfig): number {
	const key = getRateLimitKey(userId, commandName);
	const entry = rateLimits.get(key);
	
	if (!entry) {
		return 0;
	}
	
	const now = Date.now();
	
	// Check cooldown
	if (config.cooldownSeconds) {
		const cooldownRemaining = (entry.lastCommand + (config.cooldownSeconds * 1000)) - now;
		if (cooldownRemaining > 0) {
			return Math.ceil(cooldownRemaining / 1000);
		}
	}
	
	// Check minute window
	if (config.maxPerMinute && entry.count >= config.maxPerMinute) {
		const windowRemaining = entry.resetTime - now;
		if (windowRemaining > 0) {
			return Math.ceil(windowRemaining / 1000);
		}
	}
	
	return 0;
}

/**
 * Higher-Order Component that adds rate limiting to command handlers
 */
export function withRateLimit(
	handler: CommandHandler, 
	customConfig?: RateLimitConfig
): CommandHandler {
	return async (interaction: ChatInputCommandInteraction) => {
		const config = { 
			...DEFAULT_RATE_LIMITS[interaction.commandName], 
			...customConfig 
		};
		
		if (isRateLimited(interaction.user.id, interaction.commandName, config)) {
			const remainingSeconds = getRemainingCooldown(interaction.user.id, interaction.commandName, config);
			
			await safeErrorReply(
				interaction,
				`⏰ Slow down! Versuche es in ${remainingSeconds} Sekunden erneut.`
			);
			return;
		}
		
		// Execute the handler
		await handler(interaction);
		
		// Track successful command usage
		trackCommandUsage(interaction.user.id, interaction.commandName, config);
	};
}

/**
 * Cleanup expired rate limit entries (should be called periodically)
 */
export function cleanupExpiredRateLimits(): void {
	const now = Date.now();
	
	for (const [key, entry] of rateLimits.entries()) {
		if (entry.resetTime <= now) {
			rateLimits.delete(key);
		}
	}
}

// Cleanup every 5 minutes
setInterval(cleanupExpiredRateLimits, 5 * 60 * 1000);