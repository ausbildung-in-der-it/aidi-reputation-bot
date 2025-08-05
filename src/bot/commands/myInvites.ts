import { inviteTrackingService } from "@/core/services/inviteTrackingService";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";
import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

export async function handleMyInvitesCommand(interaction: ChatInputCommandInteraction) {
	await safeDeferReply(interaction, true);
	
	if (!interaction.guild) {
		await safeReply(interaction, {
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	const guildId = interaction.guild.id;
	const userId = interaction.user.id;

	try {
		const userInvites = inviteTrackingService.getUserInvites(guildId, userId);
		const stats = inviteTrackingService.getUserInviteStats(guildId, userId);

		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle("🔗 Deine Invites")
			.setThumbnail(interaction.user.displayAvatarURL())
			.setTimestamp()
			.setFooter({ text: "AIDI Reputation Bot" });

		if (userInvites.length === 0) {
			embed.setDescription("Du hast noch keine aktiven Invites erstellt.\n\nVerwende `/create-invite` um einen zu erstellen.");
		} else {
			let description = `Du hast **${userInvites.length}** aktive Invites:\n\n`;
			
			for (const invite of userInvites.slice(0, 10)) { // Limit to 10 to avoid embed limits
				const expiresDate = invite.expires_at 
					? new Date(invite.expires_at).toLocaleDateString('de-DE')
					: 'Nie';
				const usageText = `${invite.current_uses}/${invite.max_uses}`;
				
				description += `🔹 **${invite.invite_code}** - <#${invite.channel_id}>\n`;
				description += `   Uses: ${usageText} | Gültig bis: ${expiresDate}\n`;
				description += `   Link: https://discord.gg/${invite.invite_code}\n\n`;
			}

			if (userInvites.length > 10) {
				description += `... und ${userInvites.length - 10} weitere Invites`;
			}

			embed.setDescription(description);
		}

		// Add statistics
		embed.addFields([
			{
				name: "📊 Statistiken",
				value: 
					`**Aktive Invites:** ${stats.activeInvites}\n` +
					`**Erfolgreiche Joins:** ${stats.totalJoins}\n` +
					`**Pending Belohnungen:** ${stats.pendingRewards}\n` +
					`**Erhaltene Belohnungen:** ${stats.totalRewards}`,
				inline: false,
			},
		]);

		if (stats.pendingRewards > 0) {
			embed.addFields([
				{
					name: "⏳ Pending Belohnungen",
					value: `Du hast ${stats.pendingRewards} ausstehende Belohnungen.\nDiese werden nach der Bewerbungsannahme durch einen Admin vergeben.`,
					inline: false,
				},
			]);
		}

		await safeReply(interaction, { embeds: [embed] });

	} catch (error) {
		console.error("Error in my-invites command:", error);
		await safeReply(interaction, {
			content: "❌ Fehler beim Abrufen deiner Invites.",
			ephemeral: true,
		});
	}
}