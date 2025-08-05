import { inviteTrackingService } from "@/core/services/inviteTrackingService";
import { inviteChannelService } from "@/core/services/inviteChannelService";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";
import { 
	ChatInputCommandInteraction, 
	PermissionFlagsBits,
	ChannelType,
	GuildChannel,
	TextChannel
} from "discord.js";

const MAX_ACTIVE_INVITES_PER_USER = 3;
const STANDARD_MAX_USES = 10;
const STANDARD_EXPIRE_DAYS = 7;
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

	const guildId = interaction.guild.id;
	const userId = interaction.user.id;
	const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;

	// Determine channel to use
	let targetChannel: GuildChannel | null = null;
	
	if (isAdmin) {
		// Admins can specify a channel or use default
		targetChannel = interaction.options.getChannel("channel") as GuildChannel | null;
	}
	
	// If no channel specified (or user is not admin), use default channel
	if (!targetChannel) {
		const defaultChannelConfig = inviteChannelService.getChannelConfig(guildId);
		if (!defaultChannelConfig) {
			await safeReply(interaction, {
				content: "❌ **Kein Default-Invite-Channel konfiguriert!**\n\nEin Administrator muss zuerst einen Default-Channel mit `/set-invite-channel set` setzen.",
				ephemeral: true,
			});
			return;
		}

		// Get the channel from Discord
		const channel = interaction.guild.channels.cache.get(defaultChannelConfig.channelId);
		if (!channel || channel.type !== ChannelType.GuildText) {
			await safeReply(interaction, {
				content: "❌ **Default-Invite-Channel nicht gefunden oder ungültig!**\n\nBitte informiere einen Administrator.",
				ephemeral: true,
			});
			return;
		}
		targetChannel = channel as GuildChannel;
	}

	// Determine invite parameters
	let maxUses: number;
	let expireDays: number;

	if (isAdmin) {
		// Admins can override parameters
		maxUses = interaction.options.getInteger("max_uses") || STANDARD_MAX_USES;
		expireDays = interaction.options.getInteger("expire_days") || STANDARD_EXPIRE_DAYS;
	} else {
		// Regular users get standard values
		maxUses = STANDARD_MAX_USES;
		expireDays = STANDARD_EXPIRE_DAYS;
	}

	// Check cooldown
	const now = Date.now();
	const userCooldowns = inviteCooldowns[guildId] || {};
	const lastInvite = userCooldowns[userId] || 0;
	const cooldownEnd = lastInvite + (INVITE_COOLDOWN_HOURS * 60 * 60 * 1000);

	if (now < cooldownEnd && !isAdmin) {
		const remainingHours = Math.ceil((cooldownEnd - now) / (60 * 60 * 1000));
		await safeReply(interaction, {
			content: `⏱️ Du kannst erst in ${remainingHours} Stunden einen neuen Invite erstellen.`,
			ephemeral: true,
		});
		return;
	}

	// Check if user has too many active invites
	const activeInviteCount = inviteTrackingService.getActiveInviteCount(guildId, userId);
	if (activeInviteCount >= MAX_ACTIVE_INVITES_PER_USER && !isAdmin) {
		await safeReply(interaction, {
			content: `❌ Du hast bereits ${MAX_ACTIVE_INVITES_PER_USER} aktive Invites. Lösche zuerst einen mit \`/delete-invite\`.`,
			ephemeral: true,
		});
		return;
	}

	// Validate channel (should already be validated above, but double-check)
	if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
		await safeReply(interaction, {
			content: "❌ Der Channel muss ein Text-Channel sein.",
			ephemeral: true,
		});
		return;
	}

	// Validate max uses (only for admins who can override)
	if (isAdmin && (maxUses < 1 || maxUses > 100)) {
		await safeReply(interaction, {
			content: "❌ Max-Uses muss zwischen 1 und 100 liegen.",
			ephemeral: true,
		});
		return;
	}

	// Validate expire days (only for admins who can override)
	if (isAdmin && (expireDays < 1 || expireDays > 30)) {
		await safeReply(interaction, {
			content: "❌ Ablaufzeit muss zwischen 1 und 30 Tagen liegen.",
			ephemeral: true,
		});
		return;
	}

	try {
		// Create Discord invite
		const textChannel = targetChannel as TextChannel;
		const discordInvite = await textChannel.createInvite({
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
			channelId: textChannel.id,
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
		message += `• **Channel:** <#${textChannel.id}>\n`;
		message += `• **Link:** https://discord.gg/${discordInvite.code}\n`;
		message += `• **Max Uses:** ${maxUses}\n`;
		message += `• **Gültig bis:** ${expiresDate}\n\n`;
		message += `💰 **Belohnung:** 5 RP pro erfolgreichen Join\n\n`;
		
		if (!isAdmin) {
			message += `ℹ️ *Standard-Invite mit ${STANDARD_MAX_USES} Uses und ${STANDARD_EXPIRE_DAYS} Tagen Gültigkeit.*\n`;
		}
		
		message += `ℹ️ *Teile diesen Link mit Freunden. Du erhältst RP sobald sie beitreten.*`;

		await safeReply(interaction, {
			content: message,
			ephemeral: true,
		});

	} catch (error) {
		console.error("Error creating invite:", error);
		await safeReply(interaction, {
			content: "❌ Fehler beim Erstellen des Discord-Invites. Prüfe meine Berechtigungen.",
			ephemeral: true,
		});
	}
}