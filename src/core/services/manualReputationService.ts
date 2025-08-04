import { reputationService } from "./reputationService";

export interface ManualAwardInput {
	guildId: string;
	toUserId: string;
	fromUserId: string; // Admin who is awarding
	amount: number;
	reason?: string;
}

export interface ManualAwardResult {
	success: boolean;
	error?: string;
	newTotal?: number;
	awardId?: string;
}

export const manualReputationService = {
	awardReputation: (input: ManualAwardInput): ManualAwardResult => {
		// Validate amount limits
		if (input.amount === 0) {
			return {
				success: false,
				error: "Amount cannot be zero",
			};
		}

		if (input.amount < -1000 || input.amount > 1000) {
			return {
				success: false,
				error: "Amount must be between -1000 and +1000",
			};
		}

		// Generate unique message ID for audit trail
		const awardId = `admin_award_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		try {
			// Create audit trail in reputation_events table
			reputationService.trackReputationReaction({
				guildId: input.guildId,
				messageId: awardId,
				toUserId: input.toUserId,
				fromUserId: input.fromUserId,
				emoji: "admin_award",
				amount: input.amount,
			});

			// Get new total
			const newTotal = reputationService.getUserReputation(input.guildId, input.toUserId);

			return {
				success: true,
				newTotal,
				awardId,
			};
		} catch (error) {
			console.error("Error awarding manual reputation:", error);
			return {
				success: false,
				error: "Database error occurred",
			};
		}
	},

	getManualAwardHistory: (_guildId: string, _limit: number = 50) => {
		// This would be useful for admin audit trails
		// Implementation could be added later if needed
		return [];
	},

	validateAmount: (amount: number): { valid: boolean; error?: string } => {
		if (amount === 0) {
			return { valid: false, error: "Amount cannot be zero" };
		}

		if (amount < -1000 || amount > 1000) {
			return { valid: false, error: "Amount must be between -1000 and +1000" };
		}

		return { valid: true };
	},
};