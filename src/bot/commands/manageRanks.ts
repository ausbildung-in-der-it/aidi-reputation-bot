import { discordRoleService } from "@/bot/services/discordRoleService";
import { roleManagementService } from "@/core/services/roleManagementService";
import { logger } from "@/core/services/loggingService";
import { ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from "discord.js";

export async function handleManageRanksCommand(interaction: ChatInputCommandInteraction) {
	// Check if command is run in a guild
	if (!interaction.guild) {
		await interaction.reply({
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// Check if user has administrator permissions
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		await interaction.reply({
			content: "Du benötigst Administrator-Berechtigung um Ränge zu verwalten.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const subcommand = interaction.options.getSubcommand();
	const guildId = interaction.guild.id;

	try {
		if (subcommand === "add") {
			await handleAddRank(interaction, guildId);
		} else if (subcommand === "remove") {
			await handleRemoveRank(interaction, guildId);
		} else if (subcommand === "list") {
			await handleListRanks(interaction, guildId);
		} else if (subcommand === "sync") {
			await handleSyncRanks(interaction);
		} else if (subcommand === "validate") {
			await handleValidateRanks(interaction);
		}
	} catch (error) {
		logger.error("Error in manage-ranks command", { 
			guildId, 
			command: `manage-ranks ${subcommand}`,
			error 
		});
		await interaction.reply({
			content: "Es ist ein Fehler beim Verwalten der Ränge aufgetreten.",
			flags: MessageFlags.Ephemeral,
		});
	}
}

async function handleAddRank(interaction: ChatInputCommandInteraction, guildId: string) {
	const rankName = interaction.options.getString("name", true);
	const requiredRp = interaction.options.getInteger("rp", true);
	const role = interaction.options.getRole("role", true);

	// Validate inputs
	if (requiredRp < 0) {
		await interaction.reply({
			content: "RP-Anforderung muss mindestens 0 sein.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// Check if rank already exists
	if (roleManagementService.rankExists(guildId, rankName)) {
		await interaction.reply({
			content: `Ein Rang mit dem Namen "${rankName}" existiert bereits. Verwende denselben Command um ihn zu überschreiben.`,
			flags: MessageFlags.Ephemeral,
		});
	}

	// Add the rank
	const success = roleManagementService.addRank(guildId, rankName, requiredRp, role.id);

	if (!success) {
		await interaction.reply({
			content: `Fehler beim Hinzufügen des Rangs "${rankName}".`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	let message = `✅ Rang **${rankName}** wurde erfolgreich hinzugefügt!\n\n`;
	message += `**Details:**\n`;
	message += `• **Name:** ${rankName}\n`;
	message += `• **Benötigte RP:** ${requiredRp}\n`;
	message += `• **Rolle:** ${role}\n\n`;
	message += `Users die bereits ${requiredRp} oder mehr RP haben, erhalten automatisch diese Rolle bei ihrer nächsten Aktivität.`;

	await interaction.reply({
		content: message,
		flags: MessageFlags.Ephemeral,
	});
}

async function handleRemoveRank(interaction: ChatInputCommandInteraction, guildId: string) {
	const rankName = interaction.options.getString("name", true);

	// Check if rank exists
	if (!roleManagementService.rankExists(guildId, rankName)) {
		await interaction.reply({
			content: `Ein Rang mit dem Namen "${rankName}" existiert nicht.`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// Remove the rank
	const success = roleManagementService.removeRank(guildId, rankName);

	if (!success) {
		await interaction.reply({
			content: `Fehler beim Entfernen des Rangs "${rankName}".`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	let message = `✅ Rang **${rankName}** wurde erfolgreich entfernt!\n\n`;
	message += `⚠️ **Hinweis:** Users behalten ihre Rollen, bis sie das nächste Mal RP erhalten oder du /manage-ranks sync verwendest.`;

	await interaction.reply({
		content: message,
		flags: MessageFlags.Ephemeral,
	});
}

async function handleListRanks(interaction: ChatInputCommandInteraction, guildId: string) {
	const ranks = roleManagementService.getRanksForGuild(guildId);

	if (ranks.length === 0) {
		await interaction.reply({
			content: "❌ Keine Ränge konfiguriert.\n\nVerwende `/manage-ranks add` um einen Rang hinzuzufügen.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// Validate that all roles still exist and can be managed
	const validation = discordRoleService.validateRankRoles(interaction.guild!);

	let message = `✅ **Reputation Ränge** (${ranks.length})\n\n`;

	for (const rank of ranks) {
		let roleIndicator = "✅";
		let roleMention = `<@&${rank.roleId}>`;
		let statusNote = "";

		if (validation.invalid.includes(rank.rankName)) {
			roleIndicator = "❌";
			roleMention = `~~Rolle gelöscht~~`;
			statusNote = " *(Rolle nicht gefunden)*";
		} else if (validation.unmanageable.includes(rank.rankName)) {
			roleIndicator = "⚠️";
			statusNote = " *(Bot kann Rolle nicht verwalten - Hierarchie prüfen)*";
		}

		message += `${roleIndicator} **${rank.rankName}**${statusNote}\n`;
		message += `   • **RP benötigt:** ${rank.requiredRp}\n`;
		message += `   • **Rolle:** ${roleMention}\n\n`;
	}

	if (validation.invalid.length > 0) {
		message += `\n❌ **${validation.invalid.length} Rolle(n) nicht gefunden** - Diese sollten entfernt oder neu konfiguriert werden.\n`;
	}

	if (validation.unmanageable.length > 0) {
		message += `\n⚠️ **${validation.unmanageable.length} Rolle(n) nicht verwaltbar** - Bot-Rolle muss höher in der Hierarchie sein.\n`;
		message += `Verwende \`/manage-ranks validate\` für Details.`;
	}

	await interaction.reply({
		content: message,
		flags: MessageFlags.Ephemeral,
	});
}

async function handleSyncRanks(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	try {
		const result = await discordRoleService.syncAllUserRanks(interaction.guild!);

		let message = `✅ **Rang-Synchronisation abgeschlossen!**\n\n`;
		message += `• **Erfolgreich:** ${result.success} Users\n`;
		message += `• **Fehlgeschlagen:** ${result.failed} Users\n\n`;

		if (result.failed > 0) {
			// Analyze error types
			const errorTypes = new Map<string, number>();
			for (const [key] of result.errors) {
				const errorType = key.split('_')[0];
				errorTypes.set(errorType, (errorTypes.get(errorType) || 0) + 1);
			}

			message += `⚠️ **Fehleranalyse:**\n`;
			if (errorTypes.has('permission')) {
				message += `• Bot fehlt ManageRoles Berechtigung\n`;
			}
			if (errorTypes.has('hierarchy')) {
				message += `• ${errorTypes.get('hierarchy')} Rolle(n) sind über der Bot-Rolle in der Hierarchie\n`;
			}
			if (errorTypes.has('not_found')) {
				message += `• ${errorTypes.get('not_found')} User nicht im Server gefunden\n`;
			}
			if (errorTypes.has('unknown')) {
				message += `• ${errorTypes.get('unknown')} unbekannte Fehler\n`;
			}

			message += `\n**Lösungsvorschläge:**\n`;
			message += `1. Stelle sicher, dass der Bot die 'Rollen verwalten' Berechtigung hat\n`;
			message += `2. Verschiebe die Bot-Rolle über alle Reputation-Rollen\n`;
			message += `3. Verwende \`/manage-ranks validate\` um Probleme zu identifizieren`;
		} else {
			message += `Alle User-Ränge sind jetzt synchronisiert!`;
		}

		await interaction.editReply({ content: message });
	} catch (error) {
		logger.error("Error syncing ranks", { 
			guildId: interaction.guild?.id,
			error 
		});
		await interaction.editReply({
			content: "❌ Fehler beim Synchronisieren der Ränge. Prüfe die Bot-Berechtigungen.",
		});
	}
}

async function handleValidateRanks(interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		await interaction.reply({
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const botMember = interaction.guild.members.me;
	if (!botMember) {
		await interaction.reply({
			content: "❌ Bot-Member nicht gefunden.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	let message = `📋 **Rang-System Validierung**\n\n`;

	// Check bot permissions
	message += `**Bot-Berechtigungen:**\n`;
	const hasManageRoles = botMember.permissions.has(PermissionFlagsBits.ManageRoles);
	message += `• Rollen verwalten: ${hasManageRoles ? '✅' : '❌ FEHLT'}\n\n`;

	if (!hasManageRoles) {
		message += `⚠️ **Der Bot benötigt die 'Rollen verwalten' Berechtigung!**\n\n`;
	}

	// Show bot's highest role
	message += `**Bot-Rolle Hierarchie:**\n`;
	message += `• Höchste Bot-Rolle: ${botMember.roles.highest.name} (Position: ${botMember.roles.highest.position})\n\n`;

	// Validate configured ranks
	const validation = discordRoleService.validateRankRoles(interaction.guild);
	const ranks = roleManagementService.getRanksForGuild(interaction.guild.id);

	if (ranks.length === 0) {
		message += `❌ **Keine Ränge konfiguriert**\n`;
		message += `Verwende \`/manage-ranks add\` um Ränge hinzuzufügen.`;
	} else {
		message += `**Rang-Status:**\n`;
		message += `• ✅ Verwaltbar: ${validation.valid.length}\n`;
		message += `• ⚠️ Nicht verwaltbar: ${validation.unmanageable.length}\n`;
		message += `• ❌ Nicht gefunden: ${validation.invalid.length}\n\n`;

		if (validation.unmanageable.length > 0) {
			message += `**Nicht verwaltbare Ränge:**\n`;
			for (const rankName of validation.unmanageable) {
				const detail = validation.details.get(rankName);
				message += `• ${rankName}: ${detail}\n`;
			}
			message += `\n**Lösung:** Verschiebe die Bot-Rolle über diese Rollen in den Server-Einstellungen.\n\n`;
		}

		if (validation.invalid.length > 0) {
			message += `**Nicht gefundene Ränge:**\n`;
			for (const rankName of validation.invalid) {
				message += `• ${rankName}\n`;
			}
			message += `\n**Lösung:** Entferne diese Ränge mit \`/manage-ranks remove\` oder erstelle die Rollen neu.\n`;
		}

		if (validation.valid.length === ranks.length && hasManageRoles) {
			message += `\n✅ **Alle Ränge sind korrekt konfiguriert und verwaltbar!**`;
		}
	}

	await interaction.reply({
		content: message,
		flags: MessageFlags.Ephemeral,
	});
}
