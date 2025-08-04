import { ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from "discord.js";
import { leaderboardExclusionService } from "@/core/services/leaderboardExclusionService";
import { safeDeferReply, safeReply } from "@/bot/utils/safeReply";

export async function handleLeaderboardExclusionsCommand(interaction: ChatInputCommandInteraction) {
	const isDeferred = await safeDeferReply(interaction, true);
	
	if (!interaction.guild) {
		await safeReply(interaction, {
			content: "Dieser Command kann nur in einem Server verwendet werden.",
			ephemeral: true,
		});
		return;
	}

	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		await safeReply(interaction, {
			content: "Du benötigst Administrator-Berechtigung um Leaderboard-Ausschlüsse zu verwalten.",
			ephemeral: true,
		});
		return;
	}

	const subcommand = interaction.options.getSubcommand();
	const guildId = interaction.guild.id;

	try {
		if (subcommand === "add") {
			await handleAddExclusion(interaction, guildId);
		} else if (subcommand === "remove") {
			await handleRemoveExclusion(interaction, guildId);
		} else if (subcommand === "list") {
			await handleListExclusions(interaction, guildId);
		}
	} catch (error) {
		console.error("Error in leaderboard-exclusions command:", error);
		await safeReply(interaction, {
			content: "Es ist ein Fehler beim Verwalten der Leaderboard-Ausschlüsse aufgetreten.",
			ephemeral: true,
		});
	}
}

async function handleAddExclusion(interaction: ChatInputCommandInteraction, guildId: string) {
	const role = interaction.options.getRole("role", true);
	const configuredBy = interaction.user.id;

	if (leaderboardExclusionService.isRoleExcluded(guildId, role.id)) {
		await safeReply(interaction, {
			content: `Die Rolle ${role} ist bereits vom Leaderboard ausgeschlossen.`,
			ephemeral: true,
		});
		return;
	}

	const success = leaderboardExclusionService.addExcludedRole(guildId, role.id, configuredBy);

	if (!success) {
		await safeReply(interaction, {
			content: `Fehler beim Ausschließen der Rolle ${role} vom Leaderboard.`,
			ephemeral: true,
		});
		return;
	}

	let message = `✅ Rolle **${role.name}** wurde erfolgreich vom Leaderboard ausgeschlossen!\n\n`;
	message += `**Details:**\n`;
	message += `• **Rolle:** ${role}\n`;
	message += `• **Konfiguriert von:** <@${configuredBy}>\n\n`;
	message += `User mit dieser Rolle werden nicht mehr im Leaderboard angezeigt.`;

	await safeReply(interaction, {
		content: message,
		ephemeral: true,
	});
}

async function handleRemoveExclusion(interaction: ChatInputCommandInteraction, guildId: string) {
	const role = interaction.options.getRole("role", true);

	if (!leaderboardExclusionService.isRoleExcluded(guildId, role.id)) {
		await safeReply(interaction, {
			content: `Die Rolle ${role} ist nicht vom Leaderboard ausgeschlossen.`,
			ephemeral: true,
		});
		return;
	}

	const success = leaderboardExclusionService.removeExcludedRole(guildId, role.id);

	if (!success) {
		await safeReply(interaction, {
			content: `Fehler beim Entfernen des Ausschlusses für die Rolle ${role}.`,
			ephemeral: true,
		});
		return;
	}

	let message = `✅ Ausschluss für Rolle **${role.name}** wurde erfolgreich entfernt!\n\n`;
	message += `User mit dieser Rolle werden wieder im Leaderboard angezeigt.`;

	await safeReply(interaction, {
		content: message,
		ephemeral: true,
	});
}

async function handleListExclusions(interaction: ChatInputCommandInteraction, guildId: string) {
	const exclusions = leaderboardExclusionService.getExcludedRoles(guildId);

	if (exclusions.length === 0) {
		await safeReply(interaction, {
			content: "❌ Keine Rollen vom Leaderboard ausgeschlossen.\n\nVerwende `/leaderboard-exclusions add` um eine Rolle auszuschließen.",
			ephemeral: true,
		});
		return;
	}

	let message = `✅ **Vom Leaderboard ausgeschlossene Rollen** (${exclusions.length})\n\n`;

	for (const exclusion of exclusions) {
		const role = interaction.guild!.roles.cache.get(exclusion.roleId);
		const roleDisplay = role ? `<@&${exclusion.roleId}>` : `~~Rolle gelöscht (${exclusion.roleId})~~`;
		const configuredDate = new Date(exclusion.configuredAt).toLocaleDateString("de-DE");

		message += `• **Rolle:** ${roleDisplay}\n`;
		message += `  **Konfiguriert:** ${configuredDate} von <@${exclusion.configuredBy}>\n\n`;
	}

	message += `Diese Rollen werden im Leaderboard nicht angezeigt.`;

	await safeReply(interaction, {
		content: message,
		ephemeral: true,
	});
}