import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	PermissionFlagsBits,
	ChannelType,
	TextChannel,
} from "discord.js";
import {
	configureNotificationChannel,
	toggleNotificationChannel,
	getNotificationStatus,
} from "@/core/usecases/configureNotificationChannel";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";
import { UserInfo } from "@/core/types/UserInfo";

export const data = new SlashCommandBuilder()
	.setName("notification-channel")
	.setDescription("Verwalte den Notification-Channel für Reputation-Events")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addSubcommand(subcommand =>
		subcommand
			.setName("set")
			.setDescription("Setze den Channel für Reputation-Notifications")
			.addChannelOption(option =>
				option
					.setName("channel")
					.setDescription("Der Channel für Notifications")
					.setRequired(true)
					.addChannelTypes(ChannelType.GuildText)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName("toggle")
			.setDescription("Aktiviere oder deaktiviere Notifications")
			.addBooleanOption(option =>
				option
					.setName("enabled")
					.setDescription("Notifications aktivieren (true) oder deaktivieren (false)")
					.setRequired(true)
			)
	)
	.addSubcommand(subcommand =>
		subcommand.setName("status").setDescription("Zeige den aktuellen Status der Notification-Konfiguration")
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	await safeDeferReply(interaction, true);
	
	if (!interaction.guild) {
		await safeReply(interaction, {
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	const subcommand = interaction.options.getSubcommand();
	const guildId = interaction.guild.id;

	// Create UserInfo for the command executor
	const userInfo: UserInfo = {
		id: interaction.user.id,
		username: interaction.user.username,
		displayName: interaction.user.displayName || interaction.user.username,
		isBot: interaction.user.bot,
	};

	try {
		switch (subcommand) {
			case "set":
				await handleSetChannel(interaction, guildId, userInfo);
				break;
			case "toggle":
				await handleToggle(interaction, guildId, userInfo);
				break;
			case "status":
				await handleStatus(interaction, guildId);
				break;
			default:
				await safeReply(interaction, {
					content: "Unbekannter Subcommand.",
					ephemeral: true,
				});
		}
	} catch (error) {
		console.error("Error in notification-channel command:", error);

		if (!interaction.replied) {
			await safeReply(interaction, {
				content: "Es ist ein Fehler aufgetreten. Bitte versuche es erneut.",
				ephemeral: true,
			});
		}
	}
}

async function handleSetChannel(interaction: ChatInputCommandInteraction, guildId: string, userInfo: UserInfo) {
	const channel = interaction.options.getChannel("channel", true);

	// Validate channel
	if (channel.type !== ChannelType.GuildText) {
		await safeReply(interaction, {
			content: "Bitte wähle einen Text-Channel aus.",
			ephemeral: true,
		});
		return;
	}

	// Check if bot has permission to send messages in the channel
	const textChannel = channel as TextChannel;
	const botMember = interaction.guild?.members.me;

	if (!botMember) {
		await safeReply(interaction, {
			content: "Fehler beim Überprüfen der Bot-Berechtigungen.",
			ephemeral: true,
		});
		return;
	}

	const permissions = textChannel.permissionsFor(botMember);
	if (!permissions?.has(PermissionFlagsBits.SendMessages) || !permissions?.has(PermissionFlagsBits.ViewChannel)) {
		await safeReply(interaction, {
			content: `Ich habe keine Berechtigung, Nachrichten in ${channel} zu senden. Bitte überprüfe meine Channel-Berechtigungen.`,
			ephemeral: true,
		});
		return;
	}

	// Configure the channel
	const result = await configureNotificationChannel({
		guildId,
		channelId: channel.id,
		configuredBy: userInfo,
	});

	await safeReply(interaction, {
		content: result.message,
		ephemeral: true,
	});

	// Send a test message to the configured channel if successful
	if (result.success) {
		try {
			await textChannel.send(
				"🎉 Dieser Channel wurde als Notification-Channel für Reputation-Events konfiguriert!"
			);
		} catch (error) {
			console.error("Failed to send test message to notification channel:", error);
		}
	}
}

async function handleToggle(interaction: ChatInputCommandInteraction, guildId: string, userInfo: UserInfo) {
	const enabled = interaction.options.getBoolean("enabled", true);

	const result = await toggleNotificationChannel({
		guildId,
		enabled,
		requestedBy: userInfo,
	});

	await safeReply(interaction, {
		content: result.message,
		ephemeral: true,
	});
}

async function handleStatus(interaction: ChatInputCommandInteraction, guildId: string) {
	const status = await getNotificationStatus({ guildId });

	if (!status.configured) {
		await safeReply(interaction, {
			content:
				"❌ Kein Notification-Channel konfiguriert.\n\nVerwende `/notification-channel set` um einen Channel zu konfigurieren.",
			ephemeral: true,
		});
		return;
	}

	const statusEmoji = status.enabled ? "✅" : "❌";
	const statusText = status.enabled ? "Aktiviert" : "Deaktiviert";

	const configuredDate = status.configuredAt
		? new Date(status.configuredAt).toLocaleDateString("de-DE")
		: "Unbekannt";

	await safeReply(interaction, {
		content:
			`${statusEmoji} **Notification-Channel Status**\n\n` +
			`**Status:** ${statusText}\n` +
			`**Channel:** <#${status.channelId}>\n` +
			`**Konfiguriert am:** ${configuredDate}\n` +
			`**Konfiguriert von:** <@${status.configuredBy}>`,
		ephemeral: true,
	});
}
