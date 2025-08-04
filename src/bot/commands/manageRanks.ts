import { discordRoleService } from "@/bot/services/discordRoleService";
import { roleManagementService } from "@/core/services/roleManagementService";
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
		}
	} catch (error) {
		console.error("Error in manage-ranks command:", error);
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

	// Validate that all roles still exist
	const validation = discordRoleService.validateRankRoles(interaction.guild!);

	let message = `✅ **Reputation Ränge** (${ranks.length})\n\n`;

	for (const rank of ranks) {
		const roleExists = validation.valid.includes(rank.rankName);
		const roleIndicator = roleExists ? "✅" : "❌";
		const roleMention = roleExists ? `<@&${rank.roleId}>` : `~~Rolle gelöscht~~`;

		message += `${roleIndicator} **${rank.rankName}**\n`;
		message += `   • **RP benötigt:** ${rank.requiredRp}\n`;
		message += `   • **Rolle:** ${roleMention}\n\n`;
	}

	if (validation.invalid.length > 0) {
		message += `⚠️ **Warnung:** ${validation.invalid.length} Rolle(n) wurden gelöscht und sollten entfernt oder neu konfiguriert werden.`;
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
			message += `⚠️ Einige Updates sind fehlgeschlagen. Prüfe die Bot-Berechtigungen und ob alle Rang-Rollen existieren.`;
		} else {
			message += `Alle User-Ränge sind jetzt synchronisiert!`;
		}

		await interaction.editReply({ content: message });
	} catch (error) {
		console.error("Error syncing ranks:", error);
		await interaction.editReply({
			content: "❌ Fehler beim Synchronisieren der Ränge. Prüfe die Bot-Berechtigungen.",
		});
	}
}
