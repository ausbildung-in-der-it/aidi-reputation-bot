import { inviteTrackingService } from "@/core/services/inviteTrackingService";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";
import { ChatInputCommandInteraction } from "discord.js";

export async function handleDeleteInviteCommand(interaction: ChatInputCommandInteraction) {
	await safeDeferReply(interaction, true);
	
	if (!interaction.guild) {
		await safeReply(interaction, {
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	const inviteCode = interaction.options.getString("code", true);
	const guildId = interaction.guild.id;
	const userId = interaction.user.id;

	try {
		// Check if invite exists and belongs to user
		const invite = inviteTrackingService.getInviteByCode(guildId, inviteCode);
		
		if (!invite) {
			await safeReply(interaction, {
				content: `❌ Invite \`${inviteCode}\` wurde nicht gefunden oder ist nicht aktiv.`,
				ephemeral: true,
			});
			return;
		}

		if (invite.creator_id !== userId) {
			await safeReply(interaction, {
				content: `❌ Du kannst nur deine eigenen Invites löschen.`,
				ephemeral: true,
			});
			return;
		}

		// Deactivate in database
		const success = inviteTrackingService.deleteUserInvite(guildId, inviteCode, userId);
		
		if (!success) {
			await safeReply(interaction, {
				content: `❌ Fehler beim Löschen des Invites.`,
				ephemeral: true,
			});
			return;
		}

		// Try to delete Discord invite (optional, might fail if already used/expired)
		try {
			const discordInvites = await interaction.guild.invites.fetch();
			const discordInvite = discordInvites.find(inv => inv.code === inviteCode);
			
			if (discordInvite) {
				await discordInvite.delete(`Invite deleted by user ${interaction.user.username}`);
			}
		} catch (discordError) {
			console.log("Could not delete Discord invite (might be already expired/used):", discordError);
			// This is fine, we still deactivated it in our database
		}

		await safeReply(interaction, {
			content: `✅ Invite \`${inviteCode}\` wurde erfolgreich gelöscht.`,
			ephemeral: true,
		});

	} catch (error) {
		console.error("Error in delete-invite command:", error);
		await safeReply(interaction, {
			content: "❌ Fehler beim Löschen des Invites.",
			ephemeral: true,
		});
	}
}