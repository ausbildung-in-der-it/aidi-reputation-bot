import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { inviteTrackingService } from "@/core/services/inviteTrackingService";
import { inviteChannelService } from "@/core/services/inviteChannelService";
import { manualReputationService } from "@/core/services/manualReputationService";
import { reputationService } from "@/core/services/reputationService";
import { handleCreateInviteCommand } from "@/bot/commands/createInvite";
import { handleMyInvitesCommand } from "@/bot/commands/myInvites";
import { handleDeleteInviteCommand } from "@/bot/commands/deleteInvite";
import { handleManageInvitesCommand } from "@/bot/commands/manageInvites";
import { handleSetInviteChannelCommand } from "@/bot/commands/setInviteChannel";
import { onGuildMemberAdd } from "@/bot/events/onGuildMemberAdd";
import { db } from "@/db/sqlite";
import { createDiscordUser, generateGuildId, generateMessageId } from "../setup/testUtils";
import { ChannelType, Collection } from "discord.js";

// Mock notification service
const mockSendNotification = vi.fn().mockResolvedValue(true);
vi.mock("@/bot/services/discordNotificationService", () => ({
	getDiscordNotificationService: vi.fn(() => ({
		sendNotification: mockSendNotification
	}))
}));

describe("Invite Tracking System", () => {
	let guildId: string;
	let channelId: string;

	beforeEach(async () => {
		// Clean up test database for each test
		db.exec("DELETE FROM user_invites");
		db.exec("DELETE FROM invite_joins");
		db.exec("DELETE FROM reputation_events");
		db.exec("DELETE FROM invite_channel_config");
		db.exec("DELETE FROM invite_user_rewards");
		
		guildId = generateGuildId();
		channelId = generateMessageId(); // Using as channel ID
	});

	afterEach(() => {
		vi.clearAllMocks();
		mockSendNotification.mockClear();
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
			expect(invite?.active).toBe(true); // Now properly converted to boolean
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
			expect(pendingRewards[0].rewarded).toBe(false); // Now properly converted to boolean
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
						displayName: "Creator Display",
						user: { username: "creator" },
						send: vi.fn().mockResolvedValue(true)
					})
				}
			};

			const mockMember = {
				guild: mockGuild,
				displayName: "Joined User",
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
			
			// Should have awarded RP immediately
			const creatorRP = reputationService.getUserReputation(guildId, creatorId);
			expect(creatorRP).toBe(5);
		});

		it("should send notification when member joins via invite", async () => {
			const creatorId = "creator_123";
			const joinedUserId = "joined_456";
			const inviteCode = "notify123";

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
						displayName: "Creator Display",
						user: { username: "creator" },
						send: vi.fn().mockResolvedValue(true)
					})
				}
			};

			const mockMember = {
				guild: mockGuild,
				displayName: "Joined User",
				user: {
					id: joinedUserId,
					username: "testuser",
					createdTimestamp: Date.now() - (30 * 24 * 60 * 60 * 1000) // 30 days old
				}
			};

			// Process join event
			await onGuildMemberAdd(mockMember as any);

			// Should have sent notification with RP points
			expect(mockSendNotification).toHaveBeenCalledWith({
				type: "invite_join",
				guildId,
				userId: joinedUserId,
				userName: "Joined User",
				points: 5,
				context: {
					inviteCode: inviteCode,
					inviteCreatorName: "Creator Display",
				},
			});
			
			// Should have awarded RP immediately
			const creatorRP = reputationService.getUserReputation(guildId, creatorId);
			expect(creatorRP).toBe(5);
		});

		it("should not award RP multiple times for the same user", async () => {
			const creatorId = "creator_123";
			const joinedUserId = "joined_456";
			const inviteCode1 = "first123";
			const inviteCode2 = "second123";

			// Create first tracked invite
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: inviteCode1,
				creatorId,
				channelId,
				maxUses: 1,
			});

			// Mock Discord objects for first join
			const mockInvites1 = new Collection([
				[inviteCode1, { code: inviteCode1, uses: 1 }]
			]);
			
			const mockGuild = {
				id: guildId,
				invites: {
					fetch: vi.fn().mockResolvedValue(mockInvites1)
				},
				members: {
					fetch: vi.fn().mockResolvedValue({
						displayName: "Creator Display",
						user: { username: "creator" },
						send: vi.fn().mockResolvedValue(true)
					})
				}
			};

			const mockMember = {
				guild: mockGuild,
				displayName: "Joined User",
				user: {
					id: joinedUserId,
					username: "testuser",
					createdTimestamp: Date.now() - (30 * 24 * 60 * 60 * 1000) // 30 days old
				}
			};

			// Process first join event
			await onGuildMemberAdd(mockMember as any);

			// Should have awarded RP for first join
			let creatorRP = reputationService.getUserReputation(guildId, creatorId);
			expect(creatorRP).toBe(5);

			// Create second tracked invite (same creator, same user will join again)
			inviteTrackingService.createInvite({
				guildId,
				inviteCode: inviteCode2,
				creatorId,
				channelId,
				maxUses: 1,
			});

			// Mock Discord objects for second join (same user rejoining)
			const mockInvites2 = new Collection([
				[inviteCode2, { code: inviteCode2, uses: 1 }]
			]);
			
			mockGuild.invites.fetch = vi.fn().mockResolvedValue(mockInvites2);

			// Process second join event (same user)
			await onGuildMemberAdd(mockMember as any);

			// Should NOT have awarded additional RP
			creatorRP = reputationService.getUserReputation(guildId, creatorId);
			expect(creatorRP).toBe(5); // Still 5, not 10

			// Should have sent notification with 0 points for second join
			expect(mockSendNotification).toHaveBeenLastCalledWith({
				type: "invite_join",
				guildId,
				userId: joinedUserId,
				userName: "Joined User",
				points: 0, // No points awarded for repeat user
				context: {
					inviteCode: inviteCode2,
					inviteCreatorName: "Creator Display",
				},
			});
		});
	});

	describe("User Reward Tracking", () => {
		it("should track user rewards correctly", () => {
			const creatorId = "creator_123";
			const joinedUserId = "joined_456";

			// Initially, user should not be rewarded
			expect(inviteTrackingService.hasUserBeenRewardedBefore(guildId, creatorId, joinedUserId)).toBe(false);

			// Record the reward
			const result = inviteTrackingService.recordUserReward(guildId, creatorId, joinedUserId);
			expect(result).toBe(true);

			// Now user should be marked as rewarded
			expect(inviteTrackingService.hasUserBeenRewardedBefore(guildId, creatorId, joinedUserId)).toBe(true);

			// Should not double-record (INSERT OR IGNORE)
			const secondResult = inviteTrackingService.recordUserReward(guildId, creatorId, joinedUserId);
			expect(secondResult).toBe(true); // Still returns true due to OR IGNORE

			// Get reward history
			const history = inviteTrackingService.getUserRewardHistory(guildId, creatorId);
			expect(history).toHaveLength(1);
			expect(history[0].joined_user_id).toBe(joinedUserId);
			expect(history[0].first_rewarded_at).toBeDefined();
		});

		it("should differentiate between different creators", () => {
			const creator1 = "creator_123";
			const creator2 = "creator_456";
			const joinedUserId = "joined_789";

			// Record reward for creator1
			inviteTrackingService.recordUserReward(guildId, creator1, joinedUserId);

			// Creator1 should be marked as rewarded, but not creator2
			expect(inviteTrackingService.hasUserBeenRewardedBefore(guildId, creator1, joinedUserId)).toBe(true);
			expect(inviteTrackingService.hasUserBeenRewardedBefore(guildId, creator2, joinedUserId)).toBe(false);
		});

		it("should differentiate between different guilds", () => {
			const guildId2 = generateGuildId();
			const creatorId = "creator_123";
			const joinedUserId = "joined_456";

			// Record reward for guild1
			inviteTrackingService.recordUserReward(guildId, creatorId, joinedUserId);

			// Should be rewarded in guild1 but not guild2
			expect(inviteTrackingService.hasUserBeenRewardedBefore(guildId, creatorId, joinedUserId)).toBe(true);
			expect(inviteTrackingService.hasUserBeenRewardedBefore(guildId2, creatorId, joinedUserId)).toBe(false);
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
			
			// Set up default channel configuration
			inviteChannelService.setChannelConfig({
				guildId,
				channelId,
				configuredBy: "admin_123",
			});

			const targetChannel = {
				id: channelId,
				type: ChannelType.GuildText,
				createInvite: vi.fn().mockResolvedValue({
					code: "cmd123",
					delete: vi.fn()
				})
			};

			const mockInteraction = {
				guild: { 
					id: guildId,
					channels: {
						cache: {
							get: vi.fn().mockReturnValue(targetChannel)
						}
					}
				},
				user: user,
				channelId: channelId,
				memberPermissions: {
					has: vi.fn().mockReturnValue(false), // Not admin, so subject to limits
				},
				options: {
					getChannel: vi.fn().mockReturnValue(null), // Regular user doesn't specify channel
					getInteger: vi.fn().mockReturnValue(null), // Regular user can't override params
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
				flags: 64, // Ephemeral
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
				flags: 64, // Ephemeral
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
				flags: 64, // Ephemeral
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

	describe("Default Channel Management", () => {
		it("should allow admin to set default invite channel", async () => {
			const admin = createDiscordUser("admin_123");
			const targetChannel = {
				id: channelId,
				type: ChannelType.GuildText,
			};

			const mockInteraction = {
				guild: { id: guildId },
				user: admin,
				memberPermissions: {
					has: vi.fn().mockReturnValue(true), // Is admin
				},
				options: {
					getSubcommand: vi.fn().mockReturnValue("set"),
					getChannel: vi.fn().mockReturnValue(targetChannel),
				},
				reply: vi.fn(),
			} as any;

			await handleSetInviteChannelCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Default-Invite-Channel gesetzt"),
				flags: 64, // Ephemeral
			});

			// Verify channel was configured
			const config = inviteChannelService.getChannelConfig(guildId);
			expect(config).toBeTruthy();
			expect(config?.channelId).toBe(channelId);
			expect(config?.configuredBy).toBe(admin.id);
		});

		it("should allow admin to show default invite channel", async () => {
			const admin = createDiscordUser("admin_123");

			// Set up channel first
			inviteChannelService.setChannelConfig({
				guildId,
				channelId,
				configuredBy: admin.id,
			});

			const mockInteraction = {
				guild: { id: guildId },
				user: admin,
				memberPermissions: {
					has: vi.fn().mockReturnValue(true), // Is admin
				},
				options: {
					getSubcommand: vi.fn().mockReturnValue("show"),
					getChannel: vi.fn().mockReturnValue(null), // No channel needed for show
				},
				reply: vi.fn(),
			} as any;

			await handleSetInviteChannelCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Current Default-Invite-Channel"),
				flags: 64, // Ephemeral
			});
		});

		it("should allow admin to remove default invite channel", async () => {
			const admin = createDiscordUser("admin_123");

			// Set up channel first  
			inviteChannelService.setChannelConfig({
				guildId,
				channelId,
				configuredBy: admin.id,
			});

			const mockInteraction = {
				guild: { id: guildId },
				user: admin,
				memberPermissions: {
					has: vi.fn().mockReturnValue(true), // Is admin
				},
				options: {
					getSubcommand: vi.fn().mockReturnValue("remove"),
					getChannel: vi.fn().mockReturnValue(null), // No channel needed for remove
				},
				reply: vi.fn(),
			} as any;

			await handleSetInviteChannelCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Default-Invite-Channel entfernt"),
				flags: 64, // Ephemeral
			});

			// Verify channel was removed
			const config = inviteChannelService.getChannelConfig(guildId);
			expect(config).toBeNull();
		});

		it("should deny non-admin users access to set-invite-channel", async () => {
			const user = createDiscordUser("user_123");
			const targetChannel = {
				id: channelId,
				type: ChannelType.GuildText,
			};

			const mockInteraction = {
				guild: { id: guildId },
				user: user,
				memberPermissions: {
					has: vi.fn().mockReturnValue(false), // Not admin
				},
				options: {
					getSubcommand: vi.fn().mockReturnValue("set"),
					getChannel: vi.fn().mockReturnValue(targetChannel),
				},
				reply: vi.fn(),
			} as any;

			await handleSetInviteChannelCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Administrator-Berechtigung"),
				flags: 64, // Ephemeral
			});
		});

		it("should handle show command when no channel is configured", async () => {
			const admin = createDiscordUser("admin_123");

			const mockInteraction = {
				guild: { id: guildId },
				user: admin,
				memberPermissions: {
					has: vi.fn().mockReturnValue(true), // Is admin
				},
				options: {
					getSubcommand: vi.fn().mockReturnValue("show"),
					getChannel: vi.fn().mockReturnValue(null), // No channel needed for show
				},
				reply: vi.fn(),
			} as any;

			await handleSetInviteChannelCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Kein Default-Invite-Channel konfiguriert"),
				flags: 64, // Ephemeral
			});
		});
	});

	describe("Parameter Standardization", () => {
		beforeEach(() => {
			// Set up default channel for these tests
			inviteChannelService.setChannelConfig({
				guildId,
				channelId,
				configuredBy: "admin_123",
			});
		});

		it("should give regular users standard parameters (10 uses, 7 days)", async () => {
			const user = createDiscordUser("user_123");
			const targetChannel = {
				id: channelId,
				type: ChannelType.GuildText,
				createInvite: vi.fn().mockResolvedValue({
					code: "standard123",
					delete: vi.fn()
				})
			};

			const mockInteraction = {
				guild: { 
					id: guildId,
					channels: {
						cache: {
							get: vi.fn().mockReturnValue(targetChannel)
						}
					}
				},
				user: user,
				memberPermissions: {
					has: vi.fn().mockReturnValue(false), // Regular user
				},
				options: {
					getChannel: vi.fn().mockReturnValue(null),
					getInteger: vi.fn().mockReturnValue(null),
				},
				reply: vi.fn(),
				deferReply: vi.fn(),
				editReply: vi.fn(),
				replied: false,
				deferred: false,
			} as any;

			await handleCreateInviteCommand(mockInteraction);

			// Check that Discord invite was created with standard parameters
			expect(targetChannel.createInvite).toHaveBeenCalledWith({
				maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
				maxUses: 10, // Standard max uses
				unique: true,
				reason: expect.stringContaining("user_123"),
			});

			// Verify invite was stored with standard parameters
			const invites = inviteTrackingService.getUserInvites(guildId, user.id);
			expect(invites).toHaveLength(1);
			expect(invites[0].max_uses).toBe(10);
		});

		it("should allow admins to override parameters", async () => {
			const admin = createDiscordUser("admin_123");
			const customChannel = {
				id: "custom_channel_id",
				type: ChannelType.GuildText,
				createInvite: vi.fn().mockResolvedValue({
					code: "admin123",
					delete: vi.fn()
				})
			};

			const mockInteraction = {
				guild: { 
					id: guildId,
					channels: {
						cache: {
							get: vi.fn().mockReturnValue(customChannel)
						}
					}
				},
				user: admin,
				memberPermissions: {
					has: vi.fn().mockReturnValue(true), // Admin
				},
				options: {
					getChannel: vi.fn().mockReturnValue(customChannel),
					getInteger: vi.fn()
						.mockReturnValueOnce(25) // max_uses
						.mockReturnValueOnce(14), // expire_days
				},
				reply: vi.fn(),
				deferReply: vi.fn(),
				editReply: vi.fn(),
				replied: false,
				deferred: false,
			} as any;

			await handleCreateInviteCommand(mockInteraction);

			// Check that Discord invite was created with admin's custom parameters
			expect(customChannel.createInvite).toHaveBeenCalledWith({
				maxAge: 14 * 24 * 60 * 60, // 14 days in seconds
				maxUses: 25, // Admin's custom max uses
				unique: true,
				reason: expect.stringContaining("admin_123"),
			});

			// Verify invite was stored with custom parameters
			const invites = inviteTrackingService.getUserInvites(guildId, admin.id);
			expect(invites).toHaveLength(1);
			expect(invites[0].max_uses).toBe(25);
		});

		it("should show standard parameter info in success message for regular users", async () => {
			const user = createDiscordUser("user_123");
			const targetChannel = {
				id: channelId,
				type: ChannelType.GuildText,
				createInvite: vi.fn().mockResolvedValue({
					code: "msg123",
					delete: vi.fn()
				})
			};

			const mockInteraction = {
				guild: { 
					id: guildId,
					channels: {
						cache: {
							get: vi.fn().mockReturnValue(targetChannel)
						}
					}
				},
				user: user,
				memberPermissions: {
					has: vi.fn().mockReturnValue(false), // Regular user
				},
				options: {
					getChannel: vi.fn().mockReturnValue(null),
					getInteger: vi.fn().mockReturnValue(null),
				},
				reply: vi.fn(),
				deferReply: vi.fn(),
				editReply: vi.fn(),
				replied: false,
				deferred: false,
			} as any;

			await handleCreateInviteCommand(mockInteraction);

			// Check success message contains standard parameter info
			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Standard-Invite mit 10 Uses und 7 Tagen"),
				flags: 64, // Ephemeral
			});
		});
	});

	describe("Error Scenarios", () => {
		it("should error when no default channel is configured for regular users", async () => {
			const user = createDiscordUser("user_123");

			const mockInteraction = {
				guild: { id: guildId },
				user: user,
				memberPermissions: {
					has: vi.fn().mockReturnValue(false), // Regular user
				},
				options: {
					getChannel: vi.fn().mockReturnValue(null),
					getInteger: vi.fn().mockReturnValue(null),
				},
				reply: vi.fn(),
				deferReply: vi.fn(),
				editReply: vi.fn(),
				replied: false,
				deferred: false,
			} as any;

			await handleCreateInviteCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Kein Default-Invite-Channel konfiguriert"),
				flags: 64, // Ephemeral
			});
		});

		it("should error when default channel is invalid/not found", async () => {
			const user = createDiscordUser("user_123");

			// Set up invalid channel configuration
			inviteChannelService.setChannelConfig({
				guildId,
				channelId: "invalid_channel_id",
				configuredBy: "admin_123",
			});

			const mockInteraction = {
				guild: { 
					id: guildId,
					channels: {
						cache: {
							get: vi.fn().mockReturnValue(null) // Channel not found
						}
					}
				},
				user: user,
				memberPermissions: {
					has: vi.fn().mockReturnValue(false), // Regular user
				},
				options: {
					getChannel: vi.fn().mockReturnValue(null),
					getInteger: vi.fn().mockReturnValue(null),
				},
				reply: vi.fn(),
				deferReply: vi.fn(),
				editReply: vi.fn(),
				replied: false,
				deferred: false,
			} as any;

			await handleCreateInviteCommand(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: expect.stringContaining("Default-Invite-Channel nicht gefunden oder ungültig"),
				flags: 64, // Ephemeral
			});
		});
	});
});