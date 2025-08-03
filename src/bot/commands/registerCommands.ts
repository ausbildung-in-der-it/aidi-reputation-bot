import { REST, Routes, SlashCommandBuilder } from "discord.js";

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
					option
						.setName("channel")
						.setDescription("Das Forum für Vorstellungen")
						.setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName("remove")
				.setDescription("Entfernt die Vorstellungs-Forum Konfiguration")
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName("status")
				.setDescription("Zeigt den aktuellen Vorstellungs-Forum Status an")
		),
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
