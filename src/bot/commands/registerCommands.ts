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
		),
	new SlashCommandBuilder()
		.setName("rate-limits")
		.setDescription("Zeigt die aktuellen Rate Limits eines Users an")
		.addUserOption(option =>
			option.setName("user").setDescription("Der User dessen Rate Limits angezeigt werden sollen").setRequired(false)
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
