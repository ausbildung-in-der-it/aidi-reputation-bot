import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { data as notificationChannelCommand } from "./setNotificationChannel";

const commands = [
	new SlashCommandBuilder()
		.setName("reputation")
		.setDescription("Zeigt die Reputation eines Users an")
		.addUserOption(option =>
			option.setName("user").setDescription("Der User dessen Reputation angezeigt werden soll").setRequired(false)
		),
	new SlashCommandBuilder()
		.setName("leaderboard")
		.setDescription("Zeigt das Reputation Leaderboard an")
		.addIntegerOption(option =>
			option
				.setName("limit")
				.setDescription("Anzahl der User im Leaderboard (Standard: 10)")
				.setRequired(false)
				.setMinValue(1)
				.setMaxValue(25)
		),
	new SlashCommandBuilder()
		.setName("set-introduction-channel")
		.setDescription("Konfiguriert das Vorstellungs-Forum (Admin-only)")
		.addSubcommand(subcommand =>
			subcommand
				.setName("set")
				.setDescription("Setzt das Vorstellungs-Forum")
				.addChannelOption(option =>
					option.setName("channel").setDescription("Das Forum für Vorstellungen").setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand.setName("remove").setDescription("Entfernt die Vorstellungs-Forum Konfiguration")
		)
		.addSubcommand(subcommand =>
			subcommand.setName("status").setDescription("Zeigt den aktuellen Vorstellungs-Forum Status an")
		),
	new SlashCommandBuilder()
		.setName("manage-ranks")
		.setDescription("Verwaltet Reputation-Ränge (Admin-only)")
		.addSubcommand(subcommand =>
			subcommand
				.setName("add")
				.setDescription("Fügt einen neuen Rang hinzu")
				.addStringOption(option => option.setName("name").setDescription("Name des Rangs").setRequired(true))
				.addIntegerOption(option =>
					option.setName("rp").setDescription("Benötigte RP für diesen Rang").setRequired(true).setMinValue(0)
				)
				.addRoleOption(option =>
					option.setName("role").setDescription("Discord-Rolle für diesen Rang").setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName("remove")
				.setDescription("Entfernt einen Rang")
				.addStringOption(option =>
					option.setName("name").setDescription("Name des zu entfernenden Rangs").setRequired(true)
				)
		)
		.addSubcommand(subcommand => subcommand.setName("list").setDescription("Zeigt alle konfigurierten Ränge an"))
		.addSubcommand(subcommand =>
			subcommand.setName("sync").setDescription("Synchronisiert alle User-Ränge (kann dauern)")
		)
		.addSubcommand(subcommand =>
			subcommand.setName("validate").setDescription("Überprüft Bot-Berechtigungen und Rang-Konfiguration")
		),
	new SlashCommandBuilder()
		.setName("rate-limits")
		.setDescription("Zeigt die aktuellen Rate Limits eines Users an")
		.addUserOption(option =>
			option.setName("user").setDescription("Der User dessen Rate Limits angezeigt werden sollen").setRequired(false)
		),
	new SlashCommandBuilder()
		.setName("award-rp")
		.setDescription("Vergebe oder entziehe RP als Administrator")
		.addUserOption(option =>
			option.setName("user").setDescription("Der User dem RP vergeben/entzogen werden soll").setRequired(true)
		)
		.addIntegerOption(option =>
			option
				.setName("amount")
				.setDescription("RP Betrag (positiv zum Vergeben, negativ zum Entziehen)")
				.setRequired(true)
				.setMinValue(-1000)
				.setMaxValue(1000)
		)
		.addStringOption(option =>
			option
				.setName("reason")
				.setDescription("Grund für die RP Vergabe/Entziehung (optional)")
				.setRequired(false)
				.setMaxLength(200)
		),
	new SlashCommandBuilder()
		.setName("leaderboard-exclusions")
		.setDescription("Verwaltet Leaderboard-Ausschlüsse für Rollen (Admin-only)")
		.addSubcommand(subcommand =>
			subcommand
				.setName("add")
				.setDescription("Schließt eine Rolle vom Leaderboard aus")
				.addRoleOption(option =>
					option.setName("role").setDescription("Die Rolle die ausgeschlossen werden soll").setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName("remove")
				.setDescription("Entfernt eine Rolle vom Leaderboard-Ausschluss")
				.addRoleOption(option =>
					option.setName("role").setDescription("Die Rolle die wieder eingeschlossen werden soll").setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand.setName("list").setDescription("Zeigt alle vom Leaderboard ausgeschlossenen Rollen an")
		),
	new SlashCommandBuilder()
		.setName("reputation-events")
		.setDescription("Zeigt Reputation Events eines Users an (Admin-only)")
		.addUserOption(option =>
			option.setName("user").setDescription("Der User dessen Events angezeigt werden sollen").setRequired(true)
		)
		.addIntegerOption(option =>
			option
				.setName("limit")
				.setDescription("Anzahl der Events (Standard: 20)")
				.setRequired(false)
				.setMinValue(1)
				.setMaxValue(100)
		)
		.addStringOption(option =>
			option
				.setName("type")
				.setDescription("Art der Events")
				.setRequired(false)
				.addChoices(
					{ name: "Alle Events", value: "all" },
					{ name: "Nur erhaltene RP", value: "received" },
					{ name: "Nur vergebene RP", value: "given" }
				)
		),
	new SlashCommandBuilder()
		.setName("create-invite")
		.setDescription("Erstellt einen Standard-Invite (10 Uses, 7 Tage) für den konfigurierten Channel")
		.addChannelOption(option =>
			option
				.setName("channel")
				.setDescription("Channel für den Invite (nur für Admins, nutzt sonst Default-Channel)")
				.setRequired(false)
		)
		.addIntegerOption(option =>
			option
				.setName("max_uses")
				.setDescription("Maximale Anzahl Uses (nur für Admins, Standard: 10)")
				.setRequired(false)
				.setMinValue(1)
				.setMaxValue(100)
		)
		.addIntegerOption(option =>
			option
				.setName("expire_days")
				.setDescription("Gültigkeitsdauer in Tagen (nur für Admins, Standard: 7)")
				.setRequired(false)
				.setMinValue(1)
				.setMaxValue(30)
		),
	new SlashCommandBuilder()
		.setName("my-invites")
		.setDescription("Zeigt deine aktiven Invites und Statistiken an"),
	new SlashCommandBuilder()
		.setName("delete-invite")
		.setDescription("Löscht einen deiner Invites")
		.addStringOption(option =>
			option
				.setName("code")
				.setDescription("Der Invite-Code zum Löschen")
				.setRequired(true)
		),
	new SlashCommandBuilder()
		.setName("manage-invites")
		.setDescription("Verwaltet Invite-System (Admin-only)")
		.addSubcommand(subcommand =>
			subcommand
				.setName("list")
				.setDescription("Zeigt alle aktiven Invites an")
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName("delete")
				.setDescription("Löscht einen Invite")
				.addStringOption(option =>
					option.setName("code").setDescription("Der Invite-Code zum Löschen").setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName("pending")
				.setDescription("Zeigt ausstehende Invite-Belohnungen an")
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName("award")
				.setDescription("Vergibt ausstehende Invite-Belohnungen")
				.addUserOption(option =>
					option.setName("user").setDescription("User dem die Belohnungen vergeben werden sollen").setRequired(true)
				)
		),
	new SlashCommandBuilder()
		.setName("set-invite-channel")
		.setDescription("Verwaltet den Default-Invite-Channel (Admin-only)")
		.addSubcommand(subcommand =>
			subcommand
				.setName("set")
				.setDescription("Setzt den Default-Channel für Invites")
				.addChannelOption(option =>
					option.setName("channel").setDescription("Der Channel für neue Invites").setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand.setName("remove").setDescription("Entfernt die Default-Channel Konfiguration")
		)
		.addSubcommand(subcommand =>
			subcommand.setName("show").setDescription("Zeigt den aktuellen Default-Channel an")
		),
	notificationChannelCommand,
].map(command => command.toJSON());

export async function registerSlashCommands() {
	if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
		throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID must be set");
	}

	const rest = new REST().setToken(process.env.DISCORD_TOKEN);

	try {
		console.log("Registering slash commands...");

		await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });

		console.log("Successfully registered slash commands.");
	} catch (error) {
		console.error("Error registering slash commands:", error);
	}
}
