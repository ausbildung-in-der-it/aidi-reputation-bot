import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { MessageFlags } from "discord.js";
import { handleLeaderboardExclusionsCommand } from "@/bot/commands/leaderboardExclusions";
import { handleLeaderboardCommand } from "@/bot/commands/leaderboard";
import { leaderboardExclusionService } from "@/core/services/leaderboardExclusionService";
import { reputationService } from "@/core/services/reputationService";
import { db } from "@/db/sqlite";
import { generateGuildId, generateUserId, generateMessageId } from "../setup/testUtils";

// Mock Discord.js interaction
const createMockInteraction = (
	userId: string,
	guildId: string,
	subcommand: string,
	options: any = {},
	isAdmin = true
) => ({
	guild: {
		id: guildId,
		name: "Test Guild",
		roles: {
			cache: new Map(),
		},
		members: {
			cache: new Map(),
			fetch: vi.fn().mockResolvedValue({
				roles: {
					cache: new Map(),
				},
			}),
		},
	},
	user: { id: userId },
	memberPermissions: {
		has: vi.fn().mockReturnValue(isAdmin),
	},
	options: {
		getSubcommand: () => subcommand,
		getRole: (name: string) => options.role || null,
		getInteger: (name: string) => options.limit || null,
	},
	reply: vi.fn(),
	deferReply: vi.fn(),
	editReply: vi.fn(),
	replied: false,
	deferred: false,
});

// Mock the embed creation function
vi.mock("@/bot/utils/embeds", () => ({
	createLeaderboardEmbed: (leaderboard: any[], guildName: string) => ({
		data: {
			title: "🏆 Reputation Leaderboard",
			description: `Top ${leaderboard.length} User in ${guildName}`,
			fields: leaderboard.length === 0 ? [] : [{
				name: "Rankings",
				value: leaderboard
					.map((entry, index) => `**${index + 1}.** <@${entry.to_user_id}> - **${entry.total}** Punkte`)
					.join("\n"),
			}],
		},
	}),
}));

describe("Leaderboard Exclusions", () => {
	let guildId: string;
	let adminUserId: string;
	let regularUserId: string;

	beforeEach(async () => {
		// Clean up test database for each test
		db.exec("DELETE FROM reputation_events");
		db.exec("DELETE FROM leaderboard_excluded_roles");

		guildId = generateGuildId();
		adminUserId = generateUserId();
		regularUserId = generateUserId();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Admin Command", () => {
		it("should allow admins to add role exclusions", async () => {
			const testRole = {
				id: "test-role-123",
				name: "Test Role",
			};

			const mockInteraction = createMockInteraction(adminUserId, guildId, "add", {
				role: testRole,
			});

			await handleLeaderboardExclusionsCommand(mockInteraction as any);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("wurde erfolgreich vom Leaderboard ausgeschlossen"),
				flags: MessageFlags.Ephemeral,
			});
			
			const isExcluded = leaderboardExclusionService.isRoleExcluded(guildId, testRole.id);
			expect(isExcluded).toBe(true);
		});

		it("should allow admins to remove role exclusions", async () => {
			const testRole = {
				id: "test-role-123",
				name: "Test Role",
			};

			leaderboardExclusionService.addExcludedRole(guildId, testRole.id, adminUserId);

			const mockInteraction = createMockInteraction(adminUserId, guildId, "remove", {
				role: testRole,
			});

			await handleLeaderboardExclusionsCommand(mockInteraction as any);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("wurde erfolgreich entfernt"),
				flags: MessageFlags.Ephemeral,
			});
			
			const isExcluded = leaderboardExclusionService.isRoleExcluded(guildId, testRole.id);
			expect(isExcluded).toBe(false);
		});

		it("should list excluded roles", async () => {
			const testRole = {
				id: "test-role-123",
				name: "Test Role",
			};

			const mockInteraction = createMockInteraction(adminUserId, guildId, "list");
			mockInteraction.guild.roles.cache.set(testRole.id, testRole);
			leaderboardExclusionService.addExcludedRole(guildId, testRole.id, adminUserId);

			await handleLeaderboardExclusionsCommand(mockInteraction as any);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Vom Leaderboard ausgeschlossene Rollen"),
				flags: MessageFlags.Ephemeral,
			});
		});

		it("should deny access to non-admins", async () => {
			const testRole = {
				id: "test-role-123",
				name: "Test Role",
			};

			const mockInteraction = createMockInteraction(regularUserId, guildId, "add", {
				role: testRole,
			}, false);

			await handleLeaderboardExclusionsCommand(mockInteraction as any);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Administrator-Berechtigung"),
				flags: MessageFlags.Ephemeral,
			});
		});
	});

	describe("Leaderboard Filtering", () => {
		it("should exclude users with excluded roles from leaderboard", async () => {
			const excludedRoleId = "excluded-role-123";
			const userWithExcludedRole = generateUserId();
			
			// Setup reputation data
			reputationService.trackReputationReaction({
				guildId,
				messageId: generateMessageId(),
				toUserId: userWithExcludedRole,
				fromUserId: generateUserId(),
				emoji: "🏆",
				amount: 10,
			});

			reputationService.trackReputationReaction({
				guildId,
				messageId: generateMessageId(),
				toUserId: regularUserId,
				fromUserId: generateUserId(),
				emoji: "🏆",
				amount: 5,
			});

			// Add role exclusion
			leaderboardExclusionService.addExcludedRole(guildId, excludedRoleId, adminUserId);

			// Mock the interaction with member that has excluded role
			const mockInteraction = createMockInteraction(adminUserId, guildId, "leaderboard");
			mockInteraction.options.getInteger = () => 10;
			mockInteraction.guild.members.fetch = vi.fn()
				.mockImplementation((userId) => {
					if (userId === userWithExcludedRole) {
						const roleMap = new Map([[excludedRoleId, { id: excludedRoleId }]]);
						roleMap.some = (fn) => {
							for (const role of roleMap.values()) {
								if (fn(role)) return true;
							}
							return false;
						};
						return Promise.resolve({
							roles: {
								cache: roleMap,
							},
						});
					}
					const emptyMap = new Map();
					emptyMap.some = () => false;
					return Promise.resolve({
						roles: {
							cache: emptyMap,
						},
					});
				});

			await handleLeaderboardCommand(mockInteraction as any);

			expect(mockInteraction.editReply).toHaveBeenCalled();
			const call = mockInteraction.editReply.mock.calls[0][0];
			const embed = call.embeds[0];
			
			// Should not contain user with excluded role
			expect(embed.data.fields[0].value).not.toContain(userWithExcludedRole);
			expect(embed.data.fields[0].value).toContain(regularUserId);
		});

		it("should include all users when no roles are excluded", async () => {
			// Setup reputation data
			reputationService.trackReputationReaction({
				guildId,
				messageId: generateMessageId(),
				toUserId: regularUserId,
				fromUserId: generateUserId(),
				emoji: "🏆",
				amount: 5,
			});

			const mockInteraction = createMockInteraction(adminUserId, guildId, "leaderboard");

			await handleLeaderboardCommand(mockInteraction as any);

			expect(mockInteraction.editReply).toHaveBeenCalled();
			const call = mockInteraction.editReply.mock.calls[0][0];
			const embed = call.embeds[0];
			
			expect(embed.data.fields[0].value).toContain(regularUserId);
		});
	});
});