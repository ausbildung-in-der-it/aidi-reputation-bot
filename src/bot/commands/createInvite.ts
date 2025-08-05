import { inviteTrackingService } from "@/core/services/inviteTrackingService";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";
import { 
	ChatInputCommandInteraction, 
	PermissionFlagsBits,
	ChannelType,
	GuildChannel 
} from "discord.js";

const MAX_ACTIVE_INVITES_PER_USER = 3;
const DEFAULT_EXPIRE_DAYS = 7;
const INVITE_COOLDOWN_HOURS = 24;

interface UserCooldown {
	[userId: string]: number; // timestamp
}

const inviteCooldowns: { [guildId: string]: UserCooldown } = {};

export async function handleCreateInviteCommand(interaction: ChatInputCommandInteraction) {
	await safeDeferReply(interaction, false);
	
	if (!interaction.guild) {
		await safeReply(interaction, {
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	const targetChannel = interaction.options.getChannel("channel") as GuildChannel | null;
	const maxUses = interaction.options.getInteger("max_uses") || 1;
	const expireDays = interaction.options.getInteger("expire_days") || DEFAULT_EXPIRE_DAYS;
	
	const guildId = interaction.guild.id;
	const userId = interaction.user.id;
	const channelId = targetChannel?.id || interaction.channelId;

	// Check cooldown
	const now = Date.now();
	const userCooldowns = inviteCooldowns[guildId] || {};
	const lastInvite = userCooldowns[userId] || 0;
	const cooldownEnd = lastInvite + (INVITE_COOLDOWN_HOURS * 60 * 60 * 1000);

	if (now < cooldownEnd && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		const remainingHours = Math.ceil((cooldownEnd - now) / (60 * 60 * 1000));
		await safeReply(interaction, {
			content: `⏱️ Du kannst erst in ${remainingHours} Stunden einen neuen Invite erstellen.`,
			ephemeral: true,
		});
		return;
	}

	// Check if user has too many active invites
	const activeInviteCount = inviteTrackingService.getActiveInviteCount(guildId, userId);
	if (activeInviteCount >= MAX_ACTIVE_INVITES_PER_USER && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		await safeReply(interaction, {
			content: `❌ Du hast bereits ${MAX_ACTIVE_INVITES_PER_USER} aktive Invites. Lösche zuerst einen mit \`/delete-invite\`.`,
			ephemeral: true,
		});
		return;
	}

	// Validate channel
	const channel = targetChannel || interaction.channel;
	if (!channel || channel.type !== ChannelType.GuildText) {
		await safeReply(interaction, {
			content: "❌ Der Channel muss ein Text-Channel sein.",
			ephemeral: true,
		});
		return;
	}

	// Validate max uses
	if (maxUses < 1 || maxUses > 100) {
		await safeReply(interaction, {
			content: "❌ Max-Uses muss zwischen 1 und 100 liegen.",
			ephemeral: true,
		});
		return;
	}

	// Validate expire days
	if (expireDays < 1 || expireDays > 30) {
		await safeReply(interaction, {
			content: "❌ Ablaufzeit muss zwischen 1 und 30 Tagen liegen.",
			ephemeral: true,
		});
		return;
	}

	try {
		// Create Discord invite
		const discordInvite = await channel.createInvite({
			maxAge: expireDays * 24 * 60 * 60, // Convert days to seconds
			maxUses: maxUses,
			unique: true,
			reason: `Tracked invite created by ${interaction.user.username}`,
		});

		// Calculate expires_at timestamp
		const expiresAt = new Date(Date.now() + (expireDays * 24 * 60 * 60 * 1000)).toISOString();

		// Store in database
		const success = inviteTrackingService.createInvite({
			guildId,
			inviteCode: discordInvite.code,
			creatorId: userId,
			channelId: channel.id,
			expiresAt,
			maxUses,
		});

		if (!success) {
			// If DB storage failed, try to delete the Discord invite
			try {
				await discordInvite.delete("Failed to store in database");
			} catch (deleteError) {
				console.error("Failed to cleanup Discord invite:", deleteError);
			}
			
			await safeReply(interaction, {
				content: "❌ Fehler beim Erstellen des Invites. Bitte versuche es erneut.",
				ephemeral: true,
			});
			return;
		}

		// Update cooldown
		if (!inviteCooldowns[guildId]) {
			inviteCooldowns[guildId] = {};
		}
		inviteCooldowns[guildId][userId] = now;

		// Create success embed
		const expiresDate = new Date(expiresAt).toLocaleDateString('de-DE');
		let message = `🔗 **Invite erfolgreich erstellt!**\n\n`;
		message += `**Details:**\n`;
		message += `• **Code:** \`${discordInvite.code}\`\n`;
		message += `• **Channel:** <#${channel.id}>\n`;
		message += `• **Link:** https://discord.gg/${discordInvite.code}\n`;
		message += `• **Max Uses:** ${maxUses}\n`;
		message += `• **Gültig bis:** ${expiresDate}\n\n`;
		message += `💰 **Belohnung:** 5 RP pro erfolgreichen Join (nach Bewerbungsannahme)\n\n`;
		message += `ℹ️ *Teile diesen Link mit Freunden. Du erhältst RP sobald sie beitreten und ihre Bewerbung angenommen wird.*`;

		await safeReply(interaction, {
			content: message,
		});

	} catch (error) {
		console.error("Error creating invite:", error);
		await safeReply(interaction, {
			content: "❌ Fehler beim Erstellen des Discord-Invites. Prüfe meine Berechtigungen.",
			ephemeral: true,
		});
	}
}