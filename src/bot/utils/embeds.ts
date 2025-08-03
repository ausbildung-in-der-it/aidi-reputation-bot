import { EmbedBuilder, User } from 'discord.js';

export function createReputationEmbed(user: User, reputation: number): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle('🏆 Reputation')
        .setThumbnail(user.displayAvatarURL())
        .addFields([
            {
                name: 'User',
                value: `${user.displayName || user.username} (${user.username})`,
                inline: true
            },
            {
                name: 'Reputation Punkte',
                value: reputation.toString(),
                inline: true
            }
        ])
        .setTimestamp()
        .setFooter({ text: 'AIDI Reputation Bot' });
}

export function createLeaderboardEmbed(
    leaderboard: { to_user_id: string; total: number }[],
    guildName: string
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Reputation Leaderboard')
        .setDescription(`Top ${leaderboard.length} User in ${guildName}`)
        .setTimestamp()
        .setFooter({ text: 'AIDI Reputation Bot' });

    if (leaderboard.length === 0) {
        embed.addFields([{
            name: 'Keine Daten',
            value: 'Es wurden noch keine Reputation Punkte vergeben.',
            inline: false
        }]);
        return embed;
    }

    const rankings = leaderboard.map((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
        return `${medal} **${index + 1}.** <@${entry.to_user_id}> - **${entry.total}** Punkte`;
    }).join('\n');

    embed.addFields([{
        name: 'Rankings',
        value: rankings,
        inline: false
    }]);

    return embed;
}