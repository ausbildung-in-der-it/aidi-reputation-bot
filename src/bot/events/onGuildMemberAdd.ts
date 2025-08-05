import { GuildMember } from "discord.js";
import { inviteTrackingService } from "@/core/services/inviteTrackingService";

const MIN_ACCOUNT_AGE_DAYS = 0;

export async function onGuildMemberAdd(member: GuildMember) {
	if (!member.guild) return;
	
	try {
		// Check account age to prevent abuse
		const accountAge = Date.now() - member.user.createdTimestamp;
		const minAge = MIN_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000;
		
		if (accountAge < minAge) {
			console.log(`User ${member.user.username} account too young for invite tracking (${Math.floor(accountAge / (24 * 60 * 60 * 1000))} days old)`);
			return;
		}

		// Fetch current invites to find which one was used
		const currentInvites = await member.guild.invites.fetch();
		const guildId = member.guild.id;
		
		// Get all our tracked invites
		const trackedInvites = inviteTrackingService.getAllActiveInvites(guildId);
		
		// Find which invite was used by comparing current uses
		for (const trackedInvite of trackedInvites) {
			const discordInvite = currentInvites.get(trackedInvite.invite_code);
			
			if (!discordInvite) {
				// Invite no longer exists on Discord, deactivate it
				inviteTrackingService.deactivateInvite(guildId, trackedInvite.invite_code);
				continue;
			}
			
			// Check if this invite's usage increased
			if (discordInvite.uses! > trackedInvite.current_uses) {
				console.log(`User ${member.user.username} joined via invite ${trackedInvite.invite_code} by ${trackedInvite.creator_id}`);
				
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
			}
		}
		
		// Cleanup expired invites periodically
		const cleanedUp = inviteTrackingService.cleanupExpiredInvites(guildId);
		if (cleanedUp > 0) {
			console.log(`Cleaned up ${cleanedUp} expired invites for guild ${guildId}`);
		}
		
	} catch (error) {
		console.error("Error in onGuildMemberAdd invite tracking:", error);
	}
}