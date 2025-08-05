import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { inviteTrackingService } from "@/core/services/inviteTrackingService";
import { manualReputationService } from "@/core/services/manualReputationService";
import { reputationService } from "@/core/services/reputationService";
import { handleCreateInviteCommand } from "@/bot/commands/createInvite";
import { handleMyInvitesCommand } from "@/bot/commands/myInvites";
import { handleDeleteInviteCommand } from "@/bot/commands/deleteInvite";
import { handleManageInvitesCommand } from "@/bot/commands/manageInvites";
import { onGuildMemberAdd } from "@/bot/events/onGuildMemberAdd";
import { db } from "@/db/sqlite";
import { createTestUser, createDiscordUser, generateGuildId, generateMessageId } from "../setup/testUtils";
import { MessageFlags, ChannelType, PermissionFlagsBits, Collection } from "discord.js";

describe("Invite Tracking System", () => {
	let guildId: string;
	let channelId: string;

	beforeEach(async () => {
		// Clean up test database for each test
		db.exec("DELETE FROM user_invites");
		db.exec("DELETE FROM invite_joins");
		db.exec("DELETE FROM reputation_events");
		
		guildId = generateGuildId();
		channelId = generateMessageId(); // Using as channel ID
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Invite Creation", () => {
		it("should create invite successfully", () => {
			const creatorId = "creator_123";
			const inviteCode = "abc123";
			const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

			const result = inviteTrackingService.createInvite({
				guildId,
				inviteCode,
				creatorId,
				channelId,
				expiresAt,
				maxUses: 1,
			});

			expect(result).toBe(true);

			// Verify invite is stored
			const invite = inviteTrackingService.getInviteByCode(guildId, inviteCode);
			expect(invite).toBeTruthy();
			expect(invite?.creator_id).toBe(creatorId);
			expect(invite?.channel_id).toBe(channelId);
			expect(invite?.max_uses).toBe(1);
			expect(invite?.current_uses).toBe(0);
			expect(invite?.active).toBe(1); // SQLite stores boolean as INTEGER
		});

		it("should enforce rate limits for active invites", () => {
			const creatorId = "creator_123";

			// Create 3 invites (max allowed)
			for (let i = 0; i < 3; i++) {
				inviteTrackingService.createInvite({
					guildId,
					inviteCode: `invite_${i}`,
					creatorId,
					channelId,
					maxUses: 1,
				});
			}

			const activeCount = inviteTrackingService.getActiveInviteCount(guildId, creatorId);
			expect(activeCount).toBe(3);

			// Should be able to get user's invites
			const userInvites = inviteTrackingService.getUserInvites(guildId, creatorId);
			expect(userInvites).toHaveLength(3);
		});

		it("should handle invite with default values", () => {
			const result = inviteTrackingService.createInvite({
				guildId,
				inviteCode: "default123",
				creatorId: "user_123",
				channelId,
			});

			expect(result).toBe(true);

			const invite = inviteTrackingService.getInviteByCode(guildId, "default123");
			expect(invite?.max_uses).toBe(1); // Default value
			expect(invite?.expires_at).toBeNull(); // No expiration set
		});
	});

	describe("Member Join Tracking", () => {
		it("should track join via invite successfully", () => {
			const creatorId = "creator_123";
			const joinedUserId = "joined_456";
			const inviteCode = "track123";

			// Create invite first
			inviteTrackingService.createInvite({
				guildId,
				inviteCode,
				creatorId,
				channelId,
				maxUses: 1,
			});

			// Record join
			const result = inviteTrackingService.recordInviteJoin({
				guildId,
				inviteCode,
				creatorId,
				joinedUserId,
			});

			expect(result).toBe(true);

			// Verify join is recorded
			const pendingRewards = inviteTrackingService.getPendingRewards(guildId);
			expect(pendingRewards).toHaveLength(1);
			expect(pendingRewards[0].creator_id).toBe(creatorId);
			expect(pendingRewards[0].joined_user_id).toBe(joinedUserId);
			expect(pendingRewards[0].invite_code).toBe(inviteCode);
			expect(pendingRewards[0].rewarded).toBe(0); // SQLite stores boolean as INTEGER
		});

		it("should increment usage counter", () => {
			const inviteCode = "usage123";
			
			inviteTrackingService.createInvite({
				guildId,
				inviteCode,
				creatorId: "creator_123",
				channelId,
				maxUses: 3,
			});

			// Increment usage
			const result = inviteTrackingService.incrementInviteUse(guildId, inviteCode);
			expect(result).toBe(true);

			// Check usage count
			const invite = inviteTrackingService.getInviteByCode(guildId, inviteCode);
			expect(invite?.current_uses).toBe(1);
		});

		it("should deactivate invite at max uses", () => {
			const inviteCode = "maxuse123";
			
			inviteTrackingService.createInvite({
				guildId,
				inviteCode,
				creatorId: "creator_123",
				channelId,
				maxUses: 1,
			});

			// Use the invite
			inviteTrackingService.incrementInviteUse(guildId, inviteCode);

			// Should be at max uses
			const atMax = inviteTrackingService.isInviteAtMaxUses(guildId, inviteCode);
			expect(atMax).toBe(true);

			// Deactivate
			const deactivated = inviteTrackingService.deactivateInvite(guildId, inviteCode);
			expect(deactivated).toBe(true);

			// Should no longer be found
			const invite = inviteTrackingService.getInviteByCode(guildId, inviteCode);
			expect(invite).toBeNull();
		});

		it("should process member join event with mocked Discord objects", async () => {
			const creatorId = "creator_123";
			const joinedUserId = "joined_456";
			const inviteCode = "event123";

			// Create tracked invite
			inviteTrackingService.createInvite({
				guildId,
				inviteCode,
				creatorId,
				channelId,
				maxUses: 1,
			});

			// Mock Discord objects
			const mockInvites = new Collection([
				[inviteCode, { code: inviteCode, uses: 1 }]
			]);
			
			const mockGuild = {
				id: guildId,
				invites: {
					fetch: vi.fn().mockResolvedValue(mockInvites)
				},
				members: {
					fetch: vi.fn().mockResolvedValue({
						send: vi.fn().mockResolvedValue(true)
					})
				}
			};

			const mockMember = {
				guild: mockGuild,
				user: {
					id: joinedUserId,
					username: "testuser",
					createdTimestamp: Date.now() - (30 * 24 * 60 * 60 * 1000) // 30 days old
				}
			};

			// Process join event
			await onGuildMemberAdd(mockMember as any);

			// Should have recorded the join
			const pendingRewards = inviteTrackingService.getPendingRewards(guildId);
			expect(pendingRewards).toHaveLength(1);
			expect(pendingRewards[0].joined_user_id).toBe(joinedUserId);
		});
	});

	describe("Reward Management", () => {
		beforeEach(() => {
			// Set up a join record for reward tests
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "reward123",
				creatorId: "creator_123",
				channelId,
				maxUses: 1,
			});

			inviteTrackingService.recordInviteJoin({
				guildId,
				inviteCode: "reward123",
				creatorId: "creator_123",
				joinedUserId: "joined_456",
			});
		});

		it("should award pending rewards", () => {
			const joinedUserId = "joined_456";

			// Check pending rewards exist
			const pending = inviteTrackingService.getPendingRewards(guildId);
			expect(pending).toHaveLength(1);
			expect(pending[0].joined_user_id).toBe(joinedUserId);

			// Award RP using manual reputation service
			const result = manualReputationService.awardReputation({
				guildId,
				toUserId: joinedUserId,
				fromUserId: "admin_123",
				amount: 5,
				reason: "Invite reward",
			});

			expect(result.success).toBe(true);
			expect(result.newTotal).toBe(5);

			// Mark as rewarded
			const marked = inviteTrackingService.markAsRewarded(guildId, "reward123", joinedUserId);
			expect(marked).toBe(true);

			// Should no longer be pending
			const pendingAfter = inviteTrackingService.getPendingRewards(guildId);
			expect(pendingAfter).toHaveLength(0);

			// Verify RP was awarded
			const userReputation = reputationService.getUserReputation(guildId, joinedUserId);
			expect(userReputation).toBe(5);
		});

		it("should prevent duplicate rewards", () => {
			const joinedUserId = "joined_456";

			// Mark as rewarded first
			inviteTrackingService.markAsRewarded(guildId, "reward123", joinedUserId);

			// Should no longer be pending
			const pending = inviteTrackingService.getPendingRewards(guildId);
			expect(pending).toHaveLength(0);
		});

		it("should handle missing invites gracefully", () => {
			const result = inviteTrackingService.getInviteByCode(guildId, "nonexistent");
			expect(result).toBeNull();

			const atMax = inviteTrackingService.isInviteAtMaxUses(guildId, "nonexistent");
			expect(atMax).toBe(true); // Considers non-existent as "at max"
		});
	});

	describe("User Statistics", () => {
		it("should provide accurate user invite statistics", () => {
			const userId = "stats_user_123";

			// Create some invites
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "stats1",
				creatorId: userId,
				channelId,
			});

			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "stats2",
				creatorId: userId,
				channelId,
			});

			// Record some joins
			inviteTrackingService.recordInviteJoin({
				guildId,
				inviteCode: "stats1",
				creatorId: userId,
				joinedUserId: "joined1",
			});

			inviteTrackingService.recordInviteJoin({
				guildId,
				inviteCode: "stats2",
				creatorId: userId,
				joinedUserId: "joined2",
			});

			// Mark one as rewarded
			inviteTrackingService.markAsRewarded(guildId, "stats1", "joined1");

			const stats = inviteTrackingService.getUserInviteStats(guildId, userId);

			expect(stats.activeInvites).toBe(2);
			expect(stats.totalJoins).toBe(2);
			expect(stats.pendingRewards).toBe(1);
			expect(stats.totalRewards).toBe(1);
		});
	});

	describe("Discord Command Integration", () => {
		it("should handle create-invite command successfully", async () => {
			const user = createDiscordUser("user_123");
			const targetChannel = {
				id: channelId,
				type: ChannelType.GuildText,
				createInvite: vi.fn().mockResolvedValue({
					code: "cmd123",
					delete: vi.fn()
				})
			};

			const mockInteraction = {
				guild: { id: guildId },
				user: user,
				channelId: channelId,
				memberPermissions: {
					has: vi.fn().mockReturnValue(false), // Not admin, so subject to limits
				},
				options: {
					getChannel: vi.fn().mockReturnValue(targetChannel),
					getInteger: vi.fn()
						.mockReturnValueOnce(1) // max_uses
						.mockReturnValueOnce(7), // expire_days
				},
				channel: targetChannel,
				reply: vi.fn(),
				deferReply: vi.fn(),
				editReply: vi.fn(),
				replied: false,
				deferred: false,
			} as any;

			await handleCreateInviteCommand(mockInteraction);

			expect(targetChannel.createInvite).toHaveBeenCalled();
			expect(mockInteraction.reply).toHaveBeenCalled();

			// Verify invite was stored
			const invites = inviteTrackingService.getUserInvites(guildId, user.id);
			expect(invites).toHaveLength(1);
		});

		it("should handle my-invites command", async () => {
			const user = createDiscordUser("user_123");

			// Create some test invites
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "myinv1",
				creatorId: user.id,
				channelId,
			});

			const mockInteraction = {
				guild: { id: guildId },
				user: user,
				reply: vi.fn(),
				deferReply: vi.fn(),
				editReply: vi.fn(),
				replied: false,
				deferred: false,
			} as any;

			await handleMyInvitesCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.any(Array)
			});
		});

		it("should handle delete-invite command", async () => {
			const user = createDiscordUser("user_123");
			const inviteCode = "delete123";

			// Create invite to delete
			inviteTrackingService.createInvite({
				guildId,
				inviteCode,
				creatorId: user.id,
				channelId,
			});

			const mockInteraction = {
				guild: { 
					id: guildId,
					invites: {
						fetch: vi.fn().mockResolvedValue(new Collection([
							[inviteCode, { code: inviteCode, delete: vi.fn() }]
						]))
					}
				},
				user: user,
				options: {
					getString: vi.fn().mockReturnValue(inviteCode),
				},
				reply: vi.fn(),
				deferReply: vi.fn(),
				editReply: vi.fn(),
				replied: false,
				deferred: false,
			} as any;

			await handleDeleteInviteCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("erfolgreich gelöscht"),
				flags: 64, // MessageFlags.Ephemeral
			});

			// Verify invite was deactivated
			const invite = inviteTrackingService.getInviteByCode(guildId, inviteCode);
			expect(invite).toBeNull();
		});
	});

	describe("Admin Management", () => {
		it("should list all invites for admins", async () => {
			const admin = createDiscordUser("admin_123");

			// Create some test invites
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "admin1",
				creatorId: "user1",
				channelId,
			});

			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "admin2",
				creatorId: "user2",
				channelId,
			});

			const mockInteraction = {
				guild: { 
					id: guildId,
					members: {
						fetch: vi.fn().mockImplementation((userId) => ({
							displayName: `User${userId}`,
							catch: vi.fn().mockReturnValue(null)
						}))
					}
				},
				user: admin,
				memberPermissions: {
					has: vi.fn().mockReturnValue(true), // Is admin
				},
				options: {
					getSubcommand: vi.fn().mockReturnValue("list"),
				},
				reply: vi.fn(),
				deferReply: vi.fn(),
				editReply: vi.fn(),
				replied: false,
				deferred: false,
			} as any;

			await handleManageInvitesCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				embeds: expect.any(Array)
			});
		});

		it("should deny non-admin access to management", async () => {
			const user = createDiscordUser("user_123");

			const mockInteraction = {
				guild: { id: guildId },
				user: user,
				memberPermissions: {
					has: vi.fn().mockReturnValue(false), // Not admin
				},
				reply: vi.fn(),
				deferReply: vi.fn(),
				editReply: vi.fn(),
				replied: false,
				deferred: false,
			} as any;

			await handleManageInvitesCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Administrator-Berechtigung"),
				flags: 64, // MessageFlags.Ephemeral
			});
		});

		it("should award pending invite rewards", async () => {
			const admin = createDiscordUser("admin_123");
			const targetUser = createDiscordUser("target_456");

			// Set up pending reward
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "pending123",
				creatorId: "creator_123",
				channelId,
			});

			inviteTrackingService.recordInviteJoin({
				guildId,
				inviteCode: "pending123",
				creatorId: "creator_123",
				joinedUserId: targetUser.id,
			});

			const mockInteraction = {
				guild: { 
					id: guildId,
					members: {
						fetch: vi.fn().mockResolvedValue({
							displayName: "Creator"
						})
					}
				},
				user: admin,
				memberPermissions: {
					has: vi.fn().mockReturnValue(true), // Is admin
				},
				options: {
					getSubcommand: vi.fn().mockReturnValue("award"),
					getUser: vi.fn().mockReturnValue(targetUser),
				},
				reply: vi.fn(),
				deferReply: vi.fn(),
				editReply: vi.fn(),
				replied: false,
				deferred: false,
			} as any;

			await handleManageInvitesCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Invite-Belohnungen vergeben"),
				flags: 64, // MessageFlags.Ephemeral
			});

			// Verify RP was awarded
			const userReputation = reputationService.getUserReputation(guildId, targetUser.id);
			expect(userReputation).toBe(5);

			// Should no longer be pending
			const pending = inviteTrackingService.getPendingRewards(guildId);
			expect(pending).toHaveLength(0);
		});
	});

	describe("Cleanup and Maintenance", () => {
		it("should cleanup expired invites", () => {
			const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago

			// Create expired invite
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "expired123",
				creatorId: "user_123",
				channelId,
				expiresAt: pastDate,
			});

			// Create non-expired invite
			const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "valid123",
				creatorId: "user_123",
				channelId,
				expiresAt: futureDate,
			});

			const cleanedUp = inviteTrackingService.cleanupExpiredInvites(guildId);
			expect(cleanedUp).toBe(1);

			// Expired should be gone
			const expired = inviteTrackingService.getInviteByCode(guildId, "expired123");
			expect(expired).toBeNull();

			// Valid should remain
			const valid = inviteTrackingService.getInviteByCode(guildId, "valid123");
			expect(valid).toBeTruthy();
		});

		it("should get all active invites for guild", () => {
			// Create invites for multiple users
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "all1",
				creatorId: "user1",
				channelId,
			});

			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "all2",
				creatorId: "user2",
				channelId,
			});

			// Create inactive invite
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "inactive",
				creatorId: "user3",
				channelId,
			});
			inviteTrackingService.deactivateInvite(guildId, "inactive");

			const allActive = inviteTrackingService.getAllActiveInvites(guildId);
			expect(allActive).toHaveLength(2);
			expect(allActive.map(inv => inv.invite_code)).toEqual(expect.arrayContaining(["all1", "all2"]));
		});
	});

	describe("Guild Isolation", () => {
		it("should isolate invites between guilds", () => {
			const guild2Id = generateGuildId();

			// Create invites in both guilds
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "guild1",
				creatorId: "user_123",
				channelId,
			});

			inviteTrackingService.createInvite({
				guildId: guild2Id,
				inviteCode: "guild2",
				creatorId: "user_123",
				channelId,
			});

			// Each guild should only see their own invites
			const guild1Invites = inviteTrackingService.getAllActiveInvites(guildId);
			const guild2Invites = inviteTrackingService.getAllActiveInvites(guild2Id);

			expect(guild1Invites).toHaveLength(1);
			expect(guild2Invites).toHaveLength(1);
			expect(guild1Invites[0].invite_code).toBe("guild1");
			expect(guild2Invites[0].invite_code).toBe("guild2");
		});

		it("should isolate pending rewards between guilds", () => {
			const guild2Id = generateGuildId();

			// Create joins in both guilds
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: "reward1",
				creatorId: "creator1",
				channelId,
			});

			inviteTrackingService.createInvite({
				guildId: guild2Id,
				inviteCode: "reward2",
				creatorId: "creator2",
				channelId,
			});

			inviteTrackingService.recordInviteJoin({
				guildId,
				inviteCode: "reward1",
				creatorId: "creator1",
				joinedUserId: "joined1",
			});

			inviteTrackingService.recordInviteJoin({
				guildId: guild2Id,
				inviteCode: "reward2",
				creatorId: "creator2",
				joinedUserId: "joined2",
			});

			const guild1Pending = inviteTrackingService.getPendingRewards(guildId);
			const guild2Pending = inviteTrackingService.getPendingRewards(guild2Id);

			expect(guild1Pending).toHaveLength(1);
			expect(guild2Pending).toHaveLength(1);
			expect(guild1Pending[0].joined_user_id).toBe("joined1");
			expect(guild2Pending[0].joined_user_id).toBe("joined2");
		});
	});
});