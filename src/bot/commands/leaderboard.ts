import { ChatInputCommandInteraction } from 'discord.js';
import { reputationService } from '@/core/services/reputationService';
import { createLeaderboardEmbed } from '@/bot/utils/embeds';

export async function handleLeaderboardCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
        await interaction.reply({ content: 'Dieser Command kann nur in einem Server verwendet werden.', ephemeral: true });
        return;
    }

    const requestedLimit = interaction.options.getInteger('limit') || 10;
    const limit = Math.min(requestedLimit, 25); // Cap at 25 users max
    const guildId = interaction.guild.id;
    const guildName = interaction.guild.name;

    try {
        const leaderboard = reputationService.getGuildLeaderboard(guildId, limit);
        const embed = createLeaderboardEmbed(leaderboard, guildName);

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in leaderboard command:', error);
        await interaction.reply({ 
            content: 'Es ist ein Fehler beim Abrufen des Leaderboards aufgetreten.', 
            ephemeral: true 
        });
    }
}