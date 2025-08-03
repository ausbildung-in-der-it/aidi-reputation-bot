import { Interaction } from 'discord.js';
import { handleReputationCommand } from '@/bot/commands/reputation';
import { handleLeaderboardCommand } from '@/bot/commands/leaderboard';

export async function onInteractionCreate(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    try {
        switch (interaction.commandName) {
            case 'reputation':
                await handleReputationCommand(interaction);
                break;
            case 'leaderboard':
                await handleLeaderboardCommand(interaction);
                break;
            default:
                console.warn(`Unknown command: ${interaction.commandName}`);
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        
        const errorMessage = 'Es ist ein unerwarteter Fehler aufgetreten.';
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
}