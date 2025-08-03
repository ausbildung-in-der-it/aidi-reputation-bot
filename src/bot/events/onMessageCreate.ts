import { Message, PartialMessage } from "discord.js";
import { awardDailyBonus } from "@/core/usecases/awardDailyBonus";
import { UserInfo } from "@/core/types/UserInfo";

async function createUserInfo(userId: string, guild: any): Promise<UserInfo | null> {
	try {
		const member = await guild.members.fetch(userId);
		return {
			id: userId,
			isBot: member.user.bot,
			username: member.user.username,
			displayName: member.user.displayName || member.user.username,
		};
	} catch (error) {
		console.error(`Failed to fetch user info for ${userId}:`, error);
		return null;
	}
}

export async function onMessageCreate(message: Message | PartialMessage) {
	try {
		// Discord API data fetching
		if (message.partial) {
			await message.fetch();
		}

		const guildId = message.guild?.id;
		const authorId = message.author?.id;
		const messageId = message.id;

		// Basic validation of Discord data
		if (!guildId || !authorId || !message.guild || !message.author) {
			return;
		}

		// Convert Discord entity to platform-agnostic UserInfo
		const user = await createUserInfo(authorId, message.guild);

		if (!user) {
			console.debug("Failed to create user info, skipping daily bonus check");
			return;
		}

		// Delegate business logic to core layer
		const result = await awardDailyBonus({
			guildId,
			user,
			messageId,
			messageTimestamp: message.createdAt,
		});

		// Optional: Log successful daily bonus awards
		if (result.success && result.awarded) {
			console.log(
				`Daily bonus awarded: ${result.points} RP to ${user.username} in guild ${guildId} on ${result.bonusDate}`
			);
		}
	} catch (err) {
		console.error("Error in onMessageCreate:", err);
	}
}