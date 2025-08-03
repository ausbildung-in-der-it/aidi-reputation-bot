import { User, Guild, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// Rate limiting: Track last feedback time per user
const lastFeedbackTime = new Map<string, number>();
const FEEDBACK_COOLDOWN_MS = 1000; // 1 second cooldown

// Store feedback data for button interactions
export const feedbackData = new Map<string, {
    reactor: User;
    recipient: User;
    points: number;
    newTotal: number;
    emoji: string;
}>();

export interface FeedbackOptions {
    reactor: User;
    recipient: User;
    guild: Guild;
    channel?: TextChannel;
    points: number;
    newTotal: number;
    emoji: string;
}

export async function sendReputationFeedback(options: FeedbackOptions): Promise<void> {
    const { reactor, recipient, guild, channel, points, newTotal, emoji } = options;
    
    // Rate limiting check
    const now = Date.now();
    const lastTime = lastFeedbackTime.get(reactor.id) || 0;
    if (now - lastTime < FEEDBACK_COOLDOWN_MS) {
        console.debug(`Rate limited feedback for user ${reactor.id}`);
        return;
    }
    lastFeedbackTime.set(reactor.id, now);

    // Create unique button ID
    const buttonId = `reputation_feedback_${reactor.id}_${Date.now()}`;
    
    // Store feedback data for button interaction
    feedbackData.set(buttonId, {
        reactor,
        recipient,
        points,
        newTotal,
        emoji
    });

    // Create button
    const button = new ButtonBuilder()
        .setCustomId(buttonId)
        .setLabel('Reputation vergeben - Details anzeigen')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success);

    const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(button);

    // Send button message to channel
    if (channel) {
        try {
            const message = await channel.send({
                content: `<@${reactor.id}> Reputation erfolgreich vergeben! ${emoji}`,
                components: [actionRow]
            });
            
            // Auto-delete after 30 seconds and cleanup data
            setTimeout(async () => {
                try {
                    await message.delete();
                    feedbackData.delete(buttonId);
                } catch (deleteError) {
                    console.debug('Failed to delete feedback button message:', deleteError);
                }
            }, 30000);
            
            console.debug(`Sent reputation feedback button to channel ${channel.name}`);
        } catch (channelError) {
            console.error('Failed to send reputation feedback:', channelError);
        }
    } else {
        console.debug('No channel available for feedback');
    }
}

export function createFeedbackEmbed(
    reactor: User, 
    recipient: User, 
    points: number, 
    newTotal: number, 
    emoji: string
): EmbedBuilder {
    const pointsText = points === 1 ? 'Punkt' : 'Punkte';
    const totalText = newTotal === 1 ? 'Punkt' : 'Punkte';
    
    return new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Reputation vergeben!')
        .setDescription(
            `Du hast **${recipient.displayName || recipient.username}** +${points} Reputation ${pointsText} gegeben! ${emoji}\n\n` +
            `**Neue Reputation:** ${newTotal} ${totalText}`
        )
        .setThumbnail(recipient.displayAvatarURL())
        .setTimestamp()
        .setFooter({ 
            text: `Von ${reactor.displayName || reactor.username}`,
            iconURL: reactor.displayAvatarURL()
        });
}