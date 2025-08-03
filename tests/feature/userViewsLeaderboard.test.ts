import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { handleLeaderboardCommand } from '@/bot/commands/leaderboard'
import { reputationService } from '@/core/services/reputationService'
import { createTestDatabase, cleanupTestDatabase } from '../setup/testDb'
import { generateGuildId, generateUserId, generateMessageId } from '../setup/testUtils'

// Mock Discord.js interaction
const createMockInteraction = (userId: string, guildId: string, guildName: string, limit?: number) => ({
  guild: { id: guildId, name: guildName },
  user: { id: userId },
  options: {
    getInteger: (name: string) => name === 'limit' ? limit : null
  },
  reply: vi.fn(),
  replied: false,
  deferred: false
})

// Mock the embed creation function
vi.mock('@/bot/utils/embeds', () => ({
  createLeaderboardEmbed: (leaderboard: any[], guildName: string) => ({
    data: {
      title: '🏆 Reputation Leaderboard',
      description: `Top ${leaderboard.length} User in ${guildName}`,
      fields: leaderboard.length === 0 ? [
        {
          name: 'Keine Daten',
          value: 'Es wurden noch keine Reputation Punkte vergeben.',
          inline: false
        }
      ] : [
        {
          name: 'Rankings',
          value: leaderboard.map((entry, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅'
            return `${medal} **${index + 1}.** <@${entry.to_user_id}> - **${entry.total}** Punkte`
          }).join('\n'),
          inline: false
        }
      ]
    }
  })
}))

// Mock only config for test reliability
vi.mock('@/config/reputation', () => ({
  REPUTATION_EMOJIS: [{ emoji: '🏆', points: 1 }],
  RATE_LIMIT_CONFIG: {
    dailyLimit: 5,
    perRecipientLimit: 1,
    windowHours: 24
  },
  getEmojiPoints: (emoji: string) => emoji === '🏆' ? 1 : null,
  isValidReputationEmoji: (emoji: string) => emoji === '🏆'
}))

describe('User Views Leaderboard', () => {
  let testDb: Database.Database
  let guildId: string
  let guildName: string

  beforeEach(async () => {
    testDb = createTestDatabase()
    // Replace db module with test db
    vi.doMock('@/db/sqlite', () => ({
      db: testDb,
      closeDatabase: () => testDb.close()
    }))
    
    guildId = generateGuildId()
    guildName = 'Test Guild'
  })

  afterEach(() => {
    if (testDb) {
      cleanupTestDatabase(testDb)
      testDb.close()
    }
    vi.clearAllMocks()
  })

  describe('Empty leaderboard', () => {
    it('should show empty message when no reputation has been awarded', async () => {
      const userId = generateUserId()
      const mockInteraction = createMockInteraction(userId, guildId, guildName)
      
      await handleLeaderboardCommand(mockInteraction as any)
      
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            title: '🏆 Reputation Leaderboard',
            description: 'Top 0 User in Test Guild',
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: 'Keine Daten',
                value: 'Es wurden noch keine Reputation Punkte vergeben.'
              })
            ])
          })
        })]
      })
    })
  })

  describe('Populated leaderboard', () => {
    it('should show correct ranking with default limit (10)', async () => {
      const userId = generateUserId()
      
      // Setup: Create reputation data for multiple users
      const users = [
        { id: 'user_alice', points: 5 },
        { id: 'user_bob', points: 3 },
        { id: 'user_charlie', points: 7 },
        { id: 'user_diana', points: 1 }
      ]
      
      // Award reputation to each user
      users.forEach((user, userIndex) => {
        for (let i = 0; i < user.points; i++) {
          reputationService.trackReputationReaction({
            guildId,
            messageId: generateMessageId(),
            toUserId: user.id,
            fromUserId: `reactor_${userIndex}_${i}`, // Different reactors
            emoji: '🏆',
            amount: 1
          })
        }
      })
      
      const mockInteraction = createMockInteraction(userId, guildId, guildName)
      
      await handleLeaderboardCommand(mockInteraction as any)
      
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            title: '🏆 Reputation Leaderboard',
            description: 'Top 4 User in Test Guild',
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: 'Rankings',
                value: expect.stringContaining('🥇 **1.** <@user_charlie> - **7** Punkte')
              })
            ])
          })
        })]
      })
      
      // Verify rankings are sorted correctly (charlie=7, alice=5, bob=3, diana=1)
      const call = mockInteraction.reply.mock.calls[0][0]
      const rankingsValue = call.embeds[0].data.fields[0].value
      
      expect(rankingsValue).toContain('🥇 **1.** <@user_charlie> - **7** Punkte')
      expect(rankingsValue).toContain('🥈 **2.** <@user_alice> - **5** Punkte')
      expect(rankingsValue).toContain('🥉 **3.** <@user_bob> - **3** Punkte')
      expect(rankingsValue).toContain('🏅 **4.** <@user_diana> - **1** Punkte')
    })

    it('should respect custom limit parameter', async () => {
      const userId = generateUserId()
      
      // Setup: Create 5 users with different reputation
      const users = [
        { id: 'user_1', points: 5 },
        { id: 'user_2', points: 4 },
        { id: 'user_3', points: 3 },
        { id: 'user_4', points: 2 },
        { id: 'user_5', points: 1 }
      ]
      
      users.forEach((user, userIndex) => {
        for (let i = 0; i < user.points; i++) {
          reputationService.trackReputationReaction({
            guildId,
            messageId: generateMessageId(),
            toUserId: user.id,
            fromUserId: `reactor_${userIndex}_${i}`,
            emoji: '🏆',
            amount: 1
          })
        }
      })
      
      // Request top 3 only
      const mockInteraction = createMockInteraction(userId, guildId, guildName, 3)
      
      await handleLeaderboardCommand(mockInteraction as any)
      
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            description: 'Top 3 User in Test Guild'
          })
        })]
      })
      
      // Should only show top 3
      const call = mockInteraction.reply.mock.calls[0][0]
      const rankingsValue = call.embeds[0].data.fields[0].value
      
      expect(rankingsValue).toContain('user_1')
      expect(rankingsValue).toContain('user_2')
      expect(rankingsValue).toContain('user_3')
      expect(rankingsValue).not.toContain('user_4')
      expect(rankingsValue).not.toContain('user_5')
    })

    it('should handle ties correctly by maintaining database order', async () => {
      const userId = generateUserId()
      
      // Setup: Create users with same reputation (tie)
      const tiedUsers = ['user_alpha', 'user_beta', 'user_gamma']
      
      tiedUsers.forEach((user, index) => {
        reputationService.trackReputationReaction({
          guildId,
          messageId: generateMessageId(),
          toUserId: user,
          fromUserId: `reactor_${index}`,
          emoji: '🏆',
          amount: 1
        })
      })
      
      const mockInteraction = createMockInteraction(userId, guildId, guildName)
      
      await handleLeaderboardCommand(mockInteraction as any)
      
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: 'Rankings',
                value: expect.stringContaining('**1** Punkte')
              })
            ])
          })
        })]
      })
      
      // All users should have same points but different positions
      const call = mockInteraction.reply.mock.calls[0][0]
      const rankingsValue = call.embeds[0].data.fields[0].value
      
      expect(rankingsValue).toContain('🥇 **1.**')
      expect(rankingsValue).toContain('🥈 **2.**')
      expect(rankingsValue).toContain('🥉 **3.**')
    })
  })

  describe('Large leaderboard', () => {
    it('should handle maximum limit of 25 users', async () => {
      const userId = generateUserId()
      
      // Setup: Create 30 users but only show 25 max
      for (let i = 1; i <= 30; i++) {
        reputationService.trackReputationReaction({
          guildId,
          messageId: generateMessageId(),
          toUserId: `user_${i}`,
          fromUserId: `reactor_${i}`,
          emoji: '🏆',
          amount: 31 - i // Higher numbers get more points (user_1 gets 30, user_2 gets 29, etc.)
        })
      }
      
      const mockInteraction = createMockInteraction(userId, guildId, guildName, 30) // Request 30 but should be capped at 25
      
      await handleLeaderboardCommand(mockInteraction as any)
      
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            description: 'Top 25 User in Test Guild' // Should be limited to 25
          })
        })]
      })
    })
  })

  describe('Guild isolation', () => {
    it('should only show leaderboard for current guild', async () => {
      const userId = generateUserId()
      const guild1Id = generateGuildId()
      const guild2Id = generateGuildId()
      
      // Setup: Add reputation in both guilds
      reputationService.trackReputationReaction({
        guildId: guild1Id,
        messageId: generateMessageId(),
        toUserId: 'user_guild1',
        fromUserId: 'reactor1',
        emoji: '🏆',
        amount: 1
      })
      
      reputationService.trackReputationReaction({
        guildId: guild2Id,
        messageId: generateMessageId(),
        toUserId: 'user_guild2',
        fromUserId: 'reactor2',
        emoji: '🏆',
        amount: 1
      })
      
      // Check leaderboard for guild1 only
      const mockInteraction = createMockInteraction(userId, guild1Id, 'Guild 1')
      
      await handleLeaderboardCommand(mockInteraction as any)
      
      const call = mockInteraction.reply.mock.calls[0][0]
      const rankingsValue = call.embeds[0].data.fields[0].value
      
      // Should only show guild1 user
      expect(rankingsValue).toContain('user_guild1')
      expect(rankingsValue).not.toContain('user_guild2')
    })
  })

  describe('Error handling', () => {
    it('should handle guild-only enforcement', async () => {
      const userId = generateUserId()
      const mockInteraction = {
        guild: null, // No guild context
        user: { id: userId },
        options: { getInteger: () => null },
        reply: vi.fn()
      }
      
      await handleLeaderboardCommand(mockInteraction as any)
      
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Dieser Command kann nur in einem Server verwendet werden.',
        ephemeral: true
      })
    })
  })
})