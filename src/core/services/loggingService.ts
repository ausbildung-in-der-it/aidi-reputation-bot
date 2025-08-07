export enum LogLevel {
	DEBUG = "DEBUG",
	INFO = "INFO",
	WARN = "WARN",
	ERROR = "ERROR",
}

export interface LogContext {
	guildId?: string;
	userId?: string;
	roleId?: string;
	command?: string;
	error?: Error | unknown;
	details?: Record<string, any>;
}

class LoggingService {
	private logLevel: LogLevel = LogLevel.INFO;

	constructor() {
		const envLevel = process.env.LOG_LEVEL?.toUpperCase();
		if (envLevel && Object.values(LogLevel).includes(envLevel as LogLevel)) {
			this.logLevel = envLevel as LogLevel;
		}
	}

	private shouldLog(level: LogLevel): boolean {
		const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
		const currentIndex = levels.indexOf(this.logLevel);
		const requestedIndex = levels.indexOf(level);
		return requestedIndex >= currentIndex;
	}

	private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
		const timestamp = new Date().toISOString();
		const parts = [`[${timestamp}] [${level}] ${message}`];

		if (context) {
			const contextParts: string[] = [];
			if (context.guildId) {contextParts.push(`guild=${context.guildId}`);}
			if (context.userId) {contextParts.push(`user=${context.userId}`);}
			if (context.roleId) {contextParts.push(`role=${context.roleId}`);}
			if (context.command) {contextParts.push(`cmd=${context.command}`);}

			if (contextParts.length > 0) {
				parts.push(`| ${contextParts.join(" ")}`);
			}

			if (context.details) {
				// Handle BigInt serialization
				const safeDetails = JSON.stringify(context.details, (key, value) => {
					return typeof value === 'bigint' ? value.toString() : value;
				});
				parts.push(`| details=${safeDetails}`);
			}
		}

		return parts.join(" ");
	}

	debug(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.DEBUG)) {
			console.log(this.formatMessage(LogLevel.DEBUG, message, context));
		}
	}

	info(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.INFO)) {
			console.log(this.formatMessage(LogLevel.INFO, message, context));
		}
	}

	warn(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.WARN)) {
			console.warn(this.formatMessage(LogLevel.WARN, message, context));
		}
	}

	error(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.ERROR)) {
			const formattedMessage = this.formatMessage(LogLevel.ERROR, message, context);
			console.error(formattedMessage);

			if (context?.error) {
				if (context.error instanceof Error) {
					console.error(`[ERROR STACK] ${context.error.stack}`);
				} else {
					console.error(`[ERROR DETAILS]`, context.error);
				}
			}
		}
	}

	// Helper for role management specific logging
	roleOperation(
		operation: "add" | "remove" | "sync" | "check",
		success: boolean,
		details: {
			guildId: string;
			userId?: string;
			roleId?: string;
			roleName?: string;
			reason?: string;
			error?: Error | unknown;
		}
	): void {
		const message = `Role ${operation} ${success ? "succeeded" : "failed"}: ${details.roleName || details.roleId || "unknown"}`;

		const context: LogContext = {
			guildId: details.guildId,
			userId: details.userId,
			roleId: details.roleId,
			error: details.error,
			details: {
				operation,
				success,
				roleName: details.roleName,
				reason: details.reason,
			},
		};

		if (success) {
			this.info(message, context);
		} else {
			this.error(message, context);
		}
	}
}

export const logger = new LoggingService();