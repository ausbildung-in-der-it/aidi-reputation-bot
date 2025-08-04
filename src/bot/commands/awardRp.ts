import { createAdminAwardEmbed } from "@/bot/utils/embeds";
import { manualReputationService } from "@/core/services/manualReputationService";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";
import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";

export async function handleAwardRpCommand(interaction: ChatInputCommandInteraction) {
	await safeDeferReply(interaction, true);
	
	if (!interaction.guild) {
		await safeReply(interaction, {
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	// Check if user has administrator permissions
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		await safeReply(interaction, {
			content: "Du benötigst Administrator-Berechtigung um RP zu vergeben.",
			ephemeral: true,
		});
		return;
	}

	const targetUser = interaction.options.getUser("user", true);
	const amount = interaction.options.getInteger("amount", true);
	const reason = interaction.options.getString("reason") || undefined;
	const guildId = interaction.guild.id;
	const adminId = interaction.user.id;

	// Validate that admin is not awarding to themselves
	if (targetUser.id === adminId) {
		await safeReply(interaction, {
			content: "Du kannst dir nicht selbst RP vergeben.",
			ephemeral: true,
		});
		return;
	}

	// Validate that target is not a bot
	if (targetUser.bot) {
		await safeReply(interaction, {
			content: "Du kannst Bots keine RP vergeben.",
			ephemeral: true,
		});
		return;
	}

	try {
		const result = manualReputationService.awardReputation({
			guildId,
			toUserId: targetUser.id,
			fromUserId: adminId,
			amount,
			reason,
		});

		if (!result.success) {
			await safeReply(interaction, {
				content: `Fehler beim Vergeben von RP: ${result.error}`,
				ephemeral: true,
			});
			return;
		}

		const embed = createAdminAwardEmbed({
			targetUser,
			admin: interaction.user,
			amount,
			reason,
			newTotal: result.newTotal!,
		});

		await safeReply(interaction, { embeds: [embed] });
	} catch (error) {
		console.error("Error in award-rp command:", error);
		await safeReply(interaction, {
			content: "Es ist ein Fehler beim Vergeben der RP aufgetreten.",
			ephemeral: true,
		});
	}
}