import { GuildMember } from "discord.js";
import { inviteTrackingService } from "@/core/services/inviteTrackingService";
import { getDiscordNotificationService } from "@/bot/services/discordNotificationService";

const MIN_ACCOUNT_AGE_DAYS = 0;

export async function onGuildMemberAdd(member: GuildMember) {
	console.log(`🔍 [INVITE DEBUG] Member joined: ${member.user.username} (${member.user.id}) in guild ${member.guild?.name} (${member.guild?.id})`);
	
	if (!member.guild) {
		console.log(`❌ [INVITE DEBUG] No guild found for member ${member.user.username}`);
		return;
	}
	
	try {
		// Check account age to prevent abuse
		const accountAge = Date.now() - member.user.createdTimestamp;
		const minAge = MIN_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000;
		
		console.log(`🔍 [INVITE DEBUG] Account age check: ${Math.floor(accountAge / (24 * 60 * 60 * 1000))} days old (min: ${MIN_ACCOUNT_AGE_DAYS} days)`);
		
		if (accountAge < minAge) {
			console.log(`❌ [INVITE DEBUG] User ${member.user.username} account too young for invite tracking (${Math.floor(accountAge / (24 * 60 * 60 * 1000))} days old)`);
			return;
		}

		// Fetch current invites to find which one was used
		console.log(`🔍 [INVITE DEBUG] Fetching current Discord invites...`);
		const currentInvites = await member.guild.invites.fetch();
		const guildId = member.guild.id;
		
		console.log(`🔍 [INVITE DEBUG] Found ${currentInvites.size} Discord invites`);
		currentInvites.forEach(invite => {
			console.log(`  📋 Discord invite: ${invite.code} - uses: ${invite.uses}/${invite.maxUses} - creator: ${invite.inviter?.username}`);
		});
		
		// Get all our tracked invites
		console.log(`🔍 [INVITE DEBUG] Getting tracked invites from database...`);
		const trackedInvites = inviteTrackingService.getAllActiveInvites(guildId);
		console.log(`🔍 [INVITE DEBUG] Found ${trackedInvites.length} tracked invites in database:`);
		trackedInvites.forEach(invite => {
			console.log(`  📝 Tracked invite: ${invite.invite_code} - uses: ${invite.current_uses}/${invite.max_uses} - creator: ${invite.creator_id}`);
		});
		
		// Find which invite was used by comparing current uses
		console.log(`🔍 [INVITE DEBUG] Comparing Discord invites with tracked invites...`);
		let foundMatchingInvite = false;
		
		for (const trackedInvite of trackedInvites) {
			console.log(`🔍 [INVITE DEBUG] Checking tracked invite: ${trackedInvite.invite_code}`);
			const discordInvite = currentInvites.get(trackedInvite.invite_code);
			
			if (!discordInvite) {
				console.log(`❌ [INVITE DEBUG] Tracked invite ${trackedInvite.invite_code} no longer exists on Discord, deactivating...`);
				inviteTrackingService.deactivateInvite(guildId, trackedInvite.invite_code);
				continue;
			}
			
			console.log(`🔍 [INVITE DEBUG] Invite ${trackedInvite.invite_code}: Discord uses=${discordInvite.uses}, Tracked uses=${trackedInvite.current_uses}`);
			
			// Check if this invite's usage increased
			if (discordInvite.uses! > trackedInvite.current_uses) {
				console.log(`✅ [INVITE DEBUG] MATCH FOUND! User ${member.user.username} joined via invite ${trackedInvite.invite_code} by ${trackedInvite.creator_id}`);
				foundMatchingInvite = true;
				
				// Record the join
				inviteTrackingService.recordInviteJoin({
					guildId,
					inviteCode: trackedInvite.invite_code,
					creatorId: trackedInvite.creator_id,
					joinedUserId: member.user.id,
				});
				
				// Update our tracked usage count
				inviteTrackingService.incrementInviteUse(guildId, trackedInvite.invite_code);
				
				// Check if invite reached max uses and deactivate if so
				if (inviteTrackingService.isInviteAtMaxUses(guildId, trackedInvite.invite_code)) {
					inviteTrackingService.deactivateInvite(guildId, trackedInvite.invite_code);
					console.log(`Invite ${trackedInvite.invite_code} reached max uses and was deactivated`);
				}
				
				// Send public notification to notification channel
				try {
					const notificationService = getDiscordNotificationService();
					if (notificationService) {
						const creator = await member.guild.members.fetch(trackedInvite.creator_id).catch(() => null);
						const creatorName = creator?.displayName || creator?.user.username || "Unbekannt";
						
						await notificationService.sendNotification({
							type: "invite_join",
							guildId,
							userId: member.user.id,
							userName: member.displayName || member.user.username,
							points: 0, // No points until application is accepted
							context: {
								inviteCode: trackedInvite.invite_code,
								inviteCreatorName: creatorName,
							},
						});
					}
				} catch (error) {
					console.error("Error sending invite join notification:", error);
				}
				
				// Send notification to invite creator (optional)
				try {
					const creator = await member.guild.members.fetch(trackedInvite.creator_id);
					if (creator) {
						await creator.send(
							`🎉 **Jemand ist über deinen Invite beigetreten!**\n\n` +
							`**User:** ${member.user.username}\n` +
							`**Invite:** \`${trackedInvite.invite_code}\`\n\n` +
							`💰 Du erhältst 5 RP sobald die Bewerbung angenommen wird!`
						).catch(() => {
							// User has DMs disabled, that's fine
							console.log(`Could not send DM to invite creator ${trackedInvite.creator_id}`);
						});
					}
				} catch (error) {
					console.error("Error notifying invite creator:", error);
				}
				
				break; // Found the invite, no need to check others
			} else {
				console.log(`🔍 [INVITE DEBUG] No usage increase for invite ${trackedInvite.invite_code}`);
			}
		}
		
		if (!foundMatchingInvite) {
			console.log(`❌ [INVITE DEBUG] No matching tracked invite found for ${member.user.username}. Possible reasons:`);
			console.log(`  - User joined via untracked invite`);
			console.log(`  - User joined via vanity URL`);
			console.log(`  - Invite wasn't properly stored in database`);
			console.log(`  - Race condition in invite usage tracking`);
		}
		
		// Cleanup expired invites periodically
		console.log(`🔍 [INVITE DEBUG] Running cleanup for expired invites...`);
		const cleanedUp = inviteTrackingService.cleanupExpiredInvites(guildId);
		if (cleanedUp > 0) {
			console.log(`🧹 [INVITE DEBUG] Cleaned up ${cleanedUp} expired invites for guild ${guildId}`);
		} else {
			console.log(`🔍 [INVITE DEBUG] No expired invites to clean up`);
		}
		
	} catch (error) {
		console.error("❌ [INVITE DEBUG] Error in onGuildMemberAdd invite tracking:", error);
	}
}