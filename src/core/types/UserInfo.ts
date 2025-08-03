export interface UserInfo {
	id: string;
	isBot: boolean;
	username?: string;
	displayName?: string;
}

export enum ReputationValidationError {
	SELF_AWARD = "Cannot award reputation to yourself",
	BOT_RECIPIENT = "Cannot award reputation to bots",
	UNSUPPORTED_EMOJI = "Unsupported emoji for reputation award",
	DAILY_LIMIT_EXCEEDED = "Daily reputation award limit exceeded",
	RECIPIENT_LIMIT_EXCEEDED = "Already awarded reputation to this user today",
}
