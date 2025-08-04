import { introductionChannelService } from "@/core/services/introductionChannelService";
import { configureIntroductionChannel, removeIntroductionChannel } from "@/core/usecases/configureIntroductionChannel";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";
import { ChannelType, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from "discord.js";

export async function handleSetIntroductionChannelCommand(interaction: ChatInputCommandInteraction) {
	const isDeferred = await safeDeferReply(interaction, true);
	
	// Check if command is run in a guild
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
			content: "Du benötigst Administrator-Berechtigung um den Vorstellungs-Channel zu konfigurieren.",
			ephemeral: true,
		});
		return;
	}

	const subcommand = interaction.options.getSubcommand();
	const guildId = interaction.guild.id;
	const userId = interaction.user.id;

	try {
		if (subcommand === "set") {
			await handleSetChannel(interaction, guildId, userId);
		} else if (subcommand === "remove") {
			await handleRemoveChannel(interaction, guildId);
		} else if (subcommand === "status") {
			await handleShowStatus(interaction, guildId);
		}
	} catch (error) {
		console.error("Error in set-introduction-channel command:", error);
		await safeReply(interaction, {
			content: "Es ist ein Fehler beim Konfigurieren des Vorstellungs-Channels aufgetreten.",
			ephemeral: true,
		});
	}
}

async function handleSetChannel(interaction: ChatInputCommandInteraction, guildId: string, userId: string) {
	const channel = interaction.options.getChannel("channel", true);

	// Validate that it's a forum channel
	if (channel.type !== ChannelType.GuildForum) {
		await safeReply(interaction, {
			content: "Der Vorstellungs-Channel muss ein Forum-Channel sein.",
			ephemeral: true,
		});
		return;
	}

	const result = await configureIntroductionChannel({
		guildId,
		channelId: channel.id,
		configuredBy: userId,
	});

	if (!result.success) {
		await safeReply(interaction, {
			content: `Fehler beim Konfigurieren des Vorstellungs-Channels: ${result.error}`,
			ephemeral: true,
		});
		return;
	}

	let message = `✅ Vorstellungs-Forum wurde erfolgreich auf ${channel} gesetzt!\n\n`;
	message += `**Forum Belohnungen:**\n`;
	message += `• **Neuer Thread:** 5 RP für jeden neuen Vorstellungs-Thread\n`;
	message += `• **Thread-Antworten:** 2 RP für Antworten in Threads (max. 5 verschiedene Threads pro User)\n\n`;

	if (result.previousChannelId && result.previousChannelId !== channel.id) {
		message += `Der vorherige Channel <#${result.previousChannelId}> wurde ersetzt.`;
	}

	await safeReply(interaction, {
		content: message,
		ephemeral: true,
	});
}

async function handleRemoveChannel(interaction: ChatInputCommandInteraction, guildId: string) {
	const result = await removeIntroductionChannel({ guildId });

	if (!result.success) {
		await safeReply(interaction, {
			content: `Fehler beim Entfernen der Vorstellungs-Channel Konfiguration: ${result.error}`,
			ephemeral: true,
		});
		return;
	}

	if (!result.wasConfigured) {
		await safeReply(interaction, {
			content: "Es war kein Vorstellungs-Channel konfiguriert.",
			ephemeral: true,
		});
		return;
	}

	let message = "✅ Vorstellungs-Channel Konfiguration wurde entfernt.";
	if (result.removedChannelId) {
		message += `\n\nDer Channel <#${result.removedChannelId}> ist nicht mehr als Vorstellungs-Channel konfiguriert.`;
	}

	await safeReply(interaction, {
		content: message,
		ephemeral: true,
	});
}

async function handleShowStatus(interaction: ChatInputCommandInteraction, guildId: string) {
	const config = introductionChannelService.getChannelConfig(guildId);

	if (!config) {
		await safeReply(interaction, {
			content:
				"❌ Kein Vorstellungs-Forum konfiguriert.\n\nVerwende `/set-introduction-channel set` um ein Forum zu konfigurieren.",
			ephemeral: true,
		});
		return;
	}

	const configuredDate = new Date(config.configuredAt).toLocaleDateString("de-DE");
	let message = `✅ **Vorstellungs-Forum Status**\n\n`;
	message += `**Forum:** <#${config.channelId}>\n`;
	message += `**Konfiguriert am:** ${configuredDate}\n`;
	message += `**Konfiguriert von:** <@${config.configuredBy}>\n\n`;
	message += `**Aktive Belohnungen:**\n`;
	message += `• **Neuer Thread:** 5 RP\n`;
	message += `• **Thread-Antworten:** 2 RP (max. 5 verschiedene Threads pro User)`;

	await safeReply(interaction, {
		content: message,
		ephemeral: true,
	});
}
