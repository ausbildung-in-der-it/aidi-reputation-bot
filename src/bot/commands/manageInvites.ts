import { inviteTrackingService } from "@/core/services/inviteTrackingService";
import { manualReputationService } from "@/core/services/manualReputationService";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";
import { ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder } from "discord.js";

export async function handleManageInvitesCommand(interaction: ChatInputCommandInteraction) {
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
			content: "Du benötigst Administrator-Berechtigung um Invites zu verwalten.",
			ephemeral: true,
		});
		return;
	}

	const subcommand = interaction.options.getSubcommand();
	const guildId = interaction.guild.id;

	try {
		if (subcommand === "list") {
			await handleListInvites(interaction, guildId);
		} else if (subcommand === "delete") {
			await handleDeleteInvite(interaction, guildId);
		} else if (subcommand === "pending") {
			await handlePendingRewards(interaction, guildId);
		} else if (subcommand === "award") {
			await handleAwardInviteReward(interaction, guildId);
		}
	} catch (error) {
		console.error("Error in manage-invites command:", error);
		await safeReply(interaction, {
			content: "Es ist ein Fehler beim Verwalten der Invites aufgetreten.",
			ephemeral: true,
		});
	}
}

async function handleListInvites(interaction: ChatInputCommandInteraction, guildId: string) {
	const allInvites = inviteTrackingService.getAllActiveInvites(guildId);

	const embed = new EmbedBuilder()
		.setColor(0x5865f2)
		.setTitle("🔗 Alle aktiven Invites")
		.setTimestamp()
		.setFooter({ text: "AIDI Reputation Bot" });

	if (allInvites.length === 0) {
		embed.setDescription("Keine aktiven Invites gefunden.");
	} else {
		let description = `**${allInvites.length}** aktive Invites:\n\n`;
		
		for (const invite of allInvites.slice(0, 15)) { // Limit to avoid embed limits
			const creator = await interaction.guild!.members.fetch(invite.creator_id).catch(() => null);
			const creatorName = creator?.displayName || `<@${invite.creator_id}>`;
			const expiresDate = invite.expires_at 
				? new Date(invite.expires_at).toLocaleDateString('de-DE')
				: 'Nie';
			
			description += `🔹 **${invite.invite_code}** - <#${invite.channel_id}>\n`;
			description += `   Creator: ${creatorName}\n`;
			description += `   Uses: ${invite.current_uses}/${invite.max_uses} | Gültig bis: ${expiresDate}\n\n`;
		}

		if (allInvites.length > 15) {
			description += `... und ${allInvites.length - 15} weitere Invites`;
		}

		embed.setDescription(description);
	}

	await safeReply(interaction, { embeds: [embed] });
}

async function handleDeleteInvite(interaction: ChatInputCommandInteraction, guildId: string) {
	const inviteCode = interaction.options.getString("code", true);

	const invite = inviteTrackingService.getInviteByCode(guildId, inviteCode);
	
	if (!invite) {
		await safeReply(interaction, {
			content: `❌ Invite \`${inviteCode}\` wurde nicht gefunden oder ist nicht aktiv.`,
			ephemeral: true,
		});
		return;
	}

	const success = inviteTrackingService.deactivateInvite(guildId, inviteCode);
	
	if (!success) {
		await safeReply(interaction, {
			content: `❌ Fehler beim Löschen des Invites.`,
			ephemeral: true,
		});
		return;
	}

	// Try to delete Discord invite
	try {
		const discordInvites = await interaction.guild!.invites.fetch();
		const discordInvite = discordInvites.find(inv => inv.code === inviteCode);
		
		if (discordInvite) {
			await discordInvite.delete(`Admin deleted invite: ${interaction.user.username}`);
		}
	} catch (discordError) {
		console.log("Could not delete Discord invite:", discordError);
	}

	const creator = await interaction.guild!.members.fetch(invite.creator_id).catch(() => null);
	const creatorMention = creator ? creator.displayName : `<@${invite.creator_id}>`;

	await safeReply(interaction, {
		content: `✅ Invite \`${inviteCode}\` von ${creatorMention} wurde gelöscht.`,
		ephemeral: true,
	});
}

async function handlePendingRewards(interaction: ChatInputCommandInteraction, guildId: string) {
	const pendingRewards = inviteTrackingService.getPendingRewards(guildId);

	const embed = new EmbedBuilder()
		.setColor(0xffa500)
		.setTitle("⏳ Pending Invite Belohnungen")
		.setTimestamp()
		.setFooter({ text: "AIDI Reputation Bot" });

	if (pendingRewards.length === 0) {
		embed.setDescription("Keine ausstehenden Belohnungen.");
	} else {
		let description = `**${pendingRewards.length}** ausstehende Belohnungen:\n\n`;
		
		for (const reward of pendingRewards.slice(0, 15)) {
			const creator = await interaction.guild!.members.fetch(reward.creator_id).catch(() => null);
			const joinedUser = await interaction.guild!.members.fetch(reward.joined_user_id).catch(() => null);
			
			const creatorName = creator?.displayName || `<@${reward.creator_id}>`;
			const joinedUserName = joinedUser?.displayName || `<@${reward.joined_user_id}>`;
			const joinedDate = new Date(reward.joined_at).toLocaleDateString('de-DE');
			
			description += `🎁 **Creator:** ${creatorName}\n`;
			description += `   **Joined User:** ${joinedUserName}\n`;
			description += `   **Invite:** \`${reward.invite_code}\` | **Datum:** ${joinedDate}\n\n`;
		}

		if (pendingRewards.length > 15) {
			description += `... und ${pendingRewards.length - 15} weitere Belohnungen`;
		}

		embed.setDescription(description);
		embed.addFields([
			{
				name: "💡 Tipp",
				value: "Verwende `/manage-invites award @user` um eine Belohnung zu vergeben.",
				inline: false,
			},
		]);
	}

	await safeReply(interaction, { embeds: [embed] });
}

async function handleAwardInviteReward(interaction: ChatInputCommandInteraction, guildId: string) {
	const targetUser = interaction.options.getUser("user", true);
	const userId = targetUser.id;
	const adminId = interaction.user.id;

	// Check if user has pending rewards
	const pendingRewards = inviteTrackingService.getPendingRewards(guildId).filter(
		reward => reward.joined_user_id === userId
	);

	if (pendingRewards.length === 0) {
		await safeReply(interaction, {
			content: `❌ ${targetUser.displayName || targetUser.username} hat keine ausstehenden Invite-Belohnungen.`,
			ephemeral: true,
		});
		return;
	}

	// Award 5 RP for each pending reward
	const totalRewards = pendingRewards.length;
	const totalRP = totalRewards * 5;

	try {
		// Award RP using the manual reputation service
		const result = manualReputationService.awardReputation({
			guildId,
			toUserId: userId,
			fromUserId: adminId,
			amount: totalRP,
			reason: `Invite Belohnung (${totalRewards} erfolgreiche Invites)`,
		});

		if (!result.success) {
			await safeReply(interaction, {
				content: `❌ Fehler beim Vergeben der RP: ${result.error}`,
				ephemeral: true,
			});
			return;
		}

		// Mark all rewards as given
		for (const reward of pendingRewards) {
			inviteTrackingService.markAsRewarded(guildId, reward.invite_code, reward.joined_user_id);
		}

		let message = `✅ **Invite-Belohnungen vergeben!**\n\n`;
		message += `**Empfänger:** ${targetUser.displayName || targetUser.username}\n`;
		message += `**Belohnungen:** ${totalRewards} x 5 RP = ${totalRP} RP\n`;
		message += `**Neue Gesamtsumme:** ${result.newTotal} RP\n\n`;
		
		// List the specific invites
		message += `**Details:**\n`;
		for (const reward of pendingRewards) {
			const creator = await interaction.guild!.members.fetch(reward.creator_id).catch(() => null);
			const creatorName = creator?.displayName || `<@${reward.creator_id}>`;
			message += `• Invite \`${reward.invite_code}\` von ${creatorName}\n`;
		}

		await safeReply(interaction, {
			content: message,
			ephemeral: true,
		});

	} catch (error) {
		console.error("Error awarding invite rewards:", error);
		await safeReply(interaction, {
			content: "❌ Fehler beim Vergeben der Belohnungen.",
			ephemeral: true,
		});
	}
}