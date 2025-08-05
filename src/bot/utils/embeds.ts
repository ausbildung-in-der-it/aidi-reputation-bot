import { EmbedBuilder, User } from "discord.js";
import { UserRateLimitStatus } from "@/core/services/rateLimitStatusService";

export function createReputationEmbed(user: User, reputation: number): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(0x00ae86)
		.setTitle("🏆 Reputation")
		.setThumbnail(user.displayAvatarURL())
		.addFields([
			{
				name: "User",
				value: `${user.displayName || user.username} (${user.username})`,
				inline: true,
			},
			{
				name: "Reputation Punkte",
				value: reputation.toString(),
				inline: true,
			},
		])
		.setTimestamp()
		.setFooter({ text: "AIDI Reputation Bot" });
}

export function createLeaderboardEmbed(
	leaderboard: { to_user_id: string; total: number }[],
	guildName: string
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(0xffd700)
		.setTitle("🏆 Reputation Leaderboard")
		.setDescription(`Top ${leaderboard.length} User in ${guildName}`)
		.setTimestamp()
		.setFooter({ text: "AIDI Reputation Bot" });

	if (leaderboard.length === 0) {
		embed.addFields([
			{
				name: "Keine Daten",
				value: "Es wurden noch keine Reputation Punkte vergeben.",
				inline: false,
			},
		]);
		return embed;
	}

	const rankings = leaderboard
		.map((entry, index) => {
			const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🏅";
			return `${medal} **${index + 1}.** <@${entry.to_user_id}> - **${entry.total}** Punkte`;
		})
		.join("\n");

	embed.addFields([
		{
			name: "Rankings",
			value: rankings,
			inline: false,
		},
	]);

	return embed;
}

export function createRateLimitStatusEmbed(user: User, status: UserRateLimitStatus): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(0x3498db)
		.setTitle("📊 Rate Limits Status")
		.setThumbnail(user.displayAvatarURL())
		.setDescription(`Rate Limit Übersicht für ${user.displayName || user.username}`)
		.setTimestamp()
		.setFooter({ text: "AIDI Reputation Bot" });

	// Trophy limits
	const trophyStatus = status.trophies.remaining > 0 
		? `✅ ${status.trophies.used}/${status.trophies.limit} verwendet (${status.trophies.remaining} verfügbar)`
		: `❌ ${status.trophies.used}/${status.trophies.limit} verwendet (Limit erreicht)`;

	// Daily bonus status
	const bonusStatus = status.dailyBonus.received 
		? "✅ Heute bereits erhalten" 
		: "🎁 Noch verfügbar";

	// Introduction post status
	const introPostStatus = status.introductionPost.alreadyReceived
		? "✅ Bereits erhalten"
		: `📝 Verfügbar (${status.introductionPost.bonus} RP)`;

	// Introduction reply status
	const replyStatus = status.introductionReplies.remaining > 0
		? `✅ ${status.introductionReplies.used}/${status.introductionReplies.limit} verwendet (${status.introductionReplies.remaining} verfügbar)`
		: `❌ ${status.introductionReplies.used}/${status.introductionReplies.limit} verwendet (Limit erreicht)`;

	embed.addFields([
		{
			name: "🏆 Trophäen (24h)",
			value: trophyStatus,
			inline: false,
		},
		{
			name: "🎁 Daily Bonus",
			value: bonusStatus,
			inline: true,
		},
		{
			name: "📝 Introduction Post",
			value: introPostStatus,
			inline: true,
		},
		{
			name: "💬 Introduction Replies",
			value: replyStatus,
			inline: false,
		},
	]);

	return embed;
}

export function createAdminAwardEmbed(data: {
	targetUser: { id: string; displayName?: string | null; username: string };
	admin: { id: string; displayName?: string | null; username: string };
	amount: number;
	reason?: string;
	newTotal: number;
}): EmbedBuilder {
	const { targetUser, admin, amount, reason, newTotal } = data;
	
	const embed = new EmbedBuilder()
		.setColor(amount > 0 ? 0x00ff00 : 0xff6b6b) // Green for positive, red for negative
		.setTitle("⚡ Admin RP Award")
		.setTimestamp()
		.setFooter({ text: "AIDI Reputation Bot" });

	const amountText = amount > 0 ? `+${amount}` : `${amount}`;
	const actionText = amount > 0 ? "verliehen" : "abgezogen";

	embed.addFields([
		{
			name: "👤 Empfänger",
			value: `${targetUser.displayName || targetUser.username} (<@${targetUser.id}>)`,
			inline: true,
		},
		{
			name: "👨‍💼 Admin",
			value: `${admin.displayName || admin.username}`,
			inline: true,
		},
		{
			name: "💰 Betrag",
			value: `${amountText} RP ${actionText}`,
			inline: true,
		},
		{
			name: "📊 Neue Gesamtsumme",
			value: `${newTotal} RP`,
			inline: true,
		},
	]);

	if (reason) {
		embed.addFields([
			{
				name: "📝 Grund",
				value: reason,
				inline: false,
			},
		]);
	}

	return embed;
}

export function createReputationEventsEmbed(
	user: User, 
	events: Array<{
		message_id: string;
		to_user_id: string;
		from_user_id: string;
		emoji: string;
		amount: number;
		created_at: string;
		event_type: 'received' | 'given';
	}>,
	type: 'received' | 'given' | 'all'
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(0x9b59b6)
		.setTitle("📊 Reputation Events")
		.setThumbnail(user.displayAvatarURL())
		.setTimestamp()
		.setFooter({ text: "AIDI Reputation Bot" });

	const typeText = type === 'received' ? 'erhalten' : type === 'given' ? 'vergeben' : 'alle';
	embed.setDescription(`Reputation Events für ${user.displayName || user.username} (${typeText})`);

	if (events.length === 0) {
		embed.addFields([
			{
				name: "Keine Events",
				value: `Es wurden keine Reputation Events gefunden.`,
				inline: false,
			},
		]);
		return embed;
	}

	// Group events by date for better readability
	const groupedEvents: Record<string, typeof events> = {};
	events.forEach(event => {
		const date = new Date(event.created_at).toLocaleDateString('de-DE');
		if (!groupedEvents[date]) {
			groupedEvents[date] = [];
		}
		groupedEvents[date].push(event);
	});

	let fieldCount = 0;
	const maxFields = 25; // Discord limit

	for (const [date, dayEvents] of Object.entries(groupedEvents)) {
		if (fieldCount >= maxFields - 1) {
			break; // Leave space for summary field
		}

		const eventLines = dayEvents.slice(0, 10).map(event => { // Max 10 events per day to avoid field length issues
			const time = new Date(event.created_at).toLocaleTimeString('de-DE', { 
				hour: '2-digit', 
				minute: '2-digit' 
			});
			
			const eventIcon = event.event_type === 'received' ? '📥' : '📤';
			const otherUserId = event.event_type === 'received' ? event.from_user_id : event.to_user_id;
			const actionText = event.event_type === 'received' ? 'von' : 'an';
			
			return `${eventIcon} \`${time}\` ${event.emoji} **${event.amount}** RP ${actionText} <@${otherUserId}>`;
		});

		if (dayEvents.length > 10) {
			eventLines.push(`... und ${dayEvents.length - 10} weitere Events`);
		}

		embed.addFields([
			{
				name: `📅 ${date} (${dayEvents.length} Events)`,
				value: eventLines.join('\n'),
				inline: false,
			},
		]);

		fieldCount++;
	}

	// Add summary field
	const receivedCount = events.filter(e => e.event_type === 'received').length;
	const givenCount = events.filter(e => e.event_type === 'given').length;
	const totalAmount = events.reduce((sum, event) => {
		return event.event_type === 'received' ? sum + event.amount : sum;
	}, 0);

	let summaryText = `**Angezeigt:** ${events.length} Events`;
	if (type === 'all') {
		summaryText += `\n📥 **Erhalten:** ${receivedCount} Events\n📤 **Vergeben:** ${givenCount} Events`;
	}
	if (type !== 'given') {
		summaryText += `\n💰 **Gesamt RP erhalten:** ${totalAmount}`;
	}

	embed.addFields([
		{
			name: "📈 Zusammenfassung",
			value: summaryText,
			inline: false,
		},
	]);

	return embed;
}
