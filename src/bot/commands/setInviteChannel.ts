import { ChatInputCommandInteraction, PermissionFlagsBits, ChannelType, GuildChannel } from "discord.js";
import { inviteChannelService } from "@/core/services/inviteChannelService";
import { safeReply } from "@/bot/utils/safeReply";

export async function handleSetInviteChannelCommand(interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		await safeReply(interaction, {
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	// Check admin permissions
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		await safeReply(interaction, {
			content: "Du benötigst Administrator-Berechtigung um den Default-Invite-Channel zu setzen.",
			ephemeral: true,
		});
		return;
	}

	const targetChannel = interaction.options.getChannel("channel", true) as GuildChannel;
	const subcommand = interaction.options.getSubcommand();

	if (subcommand === "set") {
		// Validate channel type
		if (targetChannel.type !== ChannelType.GuildText) {
			await safeReply(interaction, {
				content: "❌ Der Channel muss ein Text-Channel sein.",
				ephemeral: true,
			});
			return;
		}

		// Set the channel
		inviteChannelService.setChannelConfig({
			guildId: interaction.guild.id,
			channelId: targetChannel.id,
			configuredBy: interaction.user.id,
		});

		await safeReply(interaction, {
			content: `✅ **Default-Invite-Channel gesetzt!**\n\nAlle neuen Invites werden nun für <#${targetChannel.id}> erstellt.\n\nUser können jetzt einfach \`/create-invite\` verwenden ohne Channel anzugeben.`,
			ephemeral: true,
		});

	} else if (subcommand === "remove") {
		const removed = inviteChannelService.removeChannelConfig(interaction.guild.id);
		
		if (removed) {
			await safeReply(interaction, {
				content: "✅ **Default-Invite-Channel entfernt!**\n\nUser müssen nun wieder einen Channel beim Erstellen von Invites angeben.",
				ephemeral: true,
			});
		} else {
			await safeReply(interaction, {
				content: "❌ Es war kein Default-Invite-Channel konfiguriert.",
				ephemeral: true,
			});
		}

	} else if (subcommand === "show") {
		const config = inviteChannelService.getChannelConfig(interaction.guild.id);
		
		if (config) {
			await safeReply(interaction, {
				content: `📋 **Current Default-Invite-Channel:**\n\n` +
					`**Channel:** <#${config.channelId}>\n` +
					`**Konfiguriert von:** <@${config.configuredBy}>\n` +
					`**Konfiguriert am:** ${new Date(config.configuredAt).toLocaleDateString('de-DE')}`,
				ephemeral: true,
			});
		} else {
			await safeReply(interaction, {
				content: "❌ Kein Default-Invite-Channel konfiguriert.\n\nVerwende `/set-invite-channel set` um einen zu setzen.",
				ephemeral: true,
			});
		}
	}
}