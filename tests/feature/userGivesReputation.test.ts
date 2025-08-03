import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { addReputationForReaction } from '@/core/usecases/addReputationForReaction'
import { reputationService } from '@/core/services/reputationService'
import { ReputationValidationError } from '@/core/types/UserInfo'
import { createTestDatabase, cleanupTestDatabase } from '../setup/testDb'
import { createTestUser, createTestBot, generateGuildId, generateMessageId } from '../setup/testUtils'

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

describe('User Gives Reputation', () => {
  let testDb: Database.Database
  let guildId: string

  beforeEach(async () => {
    testDb = createTestDatabase()
    // Replace db module with test db
    vi.doMock('@/db/sqlite', () => ({
      db: testDb,
      closeDatabase: () => testDb.close()
    }))
    
    guildId = generateGuildId()
  })

  afterEach(() => {
    if (testDb) {
      cleanupTestDatabase(testDb)
      testDb.close()
    }
    vi.clearAllMocks()
  })

  describe('Happy Path: User gives reputation via reaction', () => {
    it('should complete full reputation award workflow', async () => {
      // Setup: Create message author and reactor
      const messageAuthor = createTestUser('author_123', { 
        username: 'alice', 
        displayName: 'Alice' 
      })
      const reactor = createTestUser('reactor_456', { 
        username: 'bob', 
        displayName: 'Bob' 
      })
      const messageId = generateMessageId()
      
      // Action: User Bob reacts with 🏆 to Alice's message
      const result = await addReputationForReaction({
        guildId,
        messageId,
        recipient: messageAuthor,
        reactor,
        emoji: '🏆'
      })
      
      // Assert: Award succeeded
      expect(result.success).toBe(true)
      expect(result.points).toBe(1)
      expect(result.newTotal).toBe(1)
      expect(result.recipient?.id).toBe(messageAuthor.id)
      expect(result.reactor?.id).toBe(reactor.id)
      
      // Assert: Reputation is persisted and retrievable
      const aliceReputation = reputationService.getUserReputation(guildId, messageAuthor.id)
      expect(aliceReputation).toBe(1)
      
      // Assert: Rate limit is recorded
      const { rateLimitService } = await import('@/core/services/rateLimitService')
      const rateLimitCheck = rateLimitService.checkLimits(
        guildId, 
        reactor.id, 
        messageAuthor.id
      )
      expect(rateLimitCheck.allowed).toBe(false) // Should be blocked due to per-recipient limit
      expect(rateLimitCheck.dailyUsed).toBe(1)
    })

    it('should accumulate multiple awards from different users', async () => {
      const messageAuthor = createTestUser('author_123')
      const reactor1 = createTestUser('reactor_1')
      const reactor2 = createTestUser('reactor_2')
      const reactor3 = createTestUser('reactor_3')
      
      // Three different users award reputation to the same message author
      const awards = await Promise.all([
        addReputationForReaction({
          guildId,
          messageId: generateMessageId(),
          recipient: messageAuthor,
          reactor: reactor1,
          emoji: '🏆'
        }),
        addReputationForReaction({
          guildId,
          messageId: generateMessageId(),
          recipient: messageAuthor,
          reactor: reactor2,
          emoji: '🏆'
        }),
        addReputationForReaction({
          guildId,
          messageId: generateMessageId(),
          recipient: messageAuthor,
          reactor: reactor3,
          emoji: '🏆'
        })
      ])
      
      // All awards should succeed
      awards.forEach(result => {
        expect(result.success).toBe(true)
        expect(result.points).toBe(1)
      })
      
      // Total reputation should be 3
      const finalReputation = reputationService.getUserReputation(guildId, messageAuthor.id)
      expect(finalReputation).toBe(3)
      
      // Latest result should show correct total
      expect(awards[2].newTotal).toBe(3)
  })
  })

  describe('Business Rules Enforcement', () => {
    it('should prevent self-reputation farming', async () => {
      const user = createTestUser('user_123')
      
      const result = await addReputationForReaction({
        guildId,
        messageId: generateMessageId(),
        recipient: user,
        reactor: user, // Same user trying to award themselves
        emoji: '🏆'
      })
      
      expect(result.success).toBe(false)
      expect(result.error).toBe(ReputationValidationError.SELF_AWARD)
      
      // No reputation should be awarded
      const reputation = reputationService.getUserReputation(guildId, user.id)
      expect(reputation).toBe(0)
    })

    it('should prevent reputation awards to bots', async () => {
      const bot = createTestBot('bot_123', 'helper-bot')
      const user = createTestUser('user_456')
      
      const result = await addReputationForReaction({
        guildId,
        messageId: generateMessageId(),
        recipient: bot,
        reactor: user,
        emoji: '🏆'
      })
      
      expect(result.success).toBe(false)
      expect(result.error).toBe(ReputationValidationError.BOT_RECIPIENT)
      
      // Bot should have no reputation
      const botReputation = reputationService.getUserReputation(guildId, bot.id)
      expect(botReputation).toBe(0)
    })

    it('should reject unsupported emojis', async () => {
      const author = createTestUser('author_123')
      const reactor = createTestUser('reactor_456')
      
      const result = await addReputationForReaction({
        guildId,
        messageId: generateMessageId(),
        recipient: author,
        reactor,
        emoji: '❤️' // Not a reputation emoji
      })
      
      expect(result.success).toBe(false)
      expect(result.error).toBe(ReputationValidationError.UNSUPPORTED_EMOJI)
      
      // No reputation should be awarded
      const reputation = reputationService.getUserReputation(guildId, author.id)
      expect(reputation).toBe(0)
    })
  })

  describe('Rate Limiting in Action', () => {
    it('should enforce daily award limits', async () => {
      const spammer = createTestUser('spammer_123')
      const targets = Array.from({ length: 6 }, (_, i) => 
        createTestUser(`target_${i}`)
      )
      
      // User tries to award 6 different people (daily limit is 5)
      const results = []
      for (const target of targets) {
        const result = await addReputationForReaction({
          guildId,
          messageId: generateMessageId(),
          recipient: target,
          reactor: spammer,
          emoji: '🏆'
        })
        results.push(result)
      }
      
      // First 5 should succeed
      results.slice(0, 5).forEach((result, _index) => {
        expect(result.success).toBe(true)
        expect(result.newTotal).toBe(1) // Each target gets 1 point
      })
      
      // 6th should fail
      expect(results[5].success).toBe(false)
      expect(results[5].error).toBe(ReputationValidationError.DAILY_LIMIT_EXCEEDED)
      
      // Last target should have 0 reputation
      const lastTargetReputation = reputationService.getUserReputation(guildId, targets[5].id)
      expect(lastTargetReputation).toBe(0)
    })

    it('should enforce per-recipient limits', async () => {
      const reactor = createTestUser('reactor_123')
      const recipient = createTestUser('recipient_456')
      
      // First award should succeed
      const result1 = await addReputationForReaction({
        guildId,
        messageId: generateMessageId(),
        recipient,
        reactor,
        emoji: '🏆'
      })
      
      expect(result1.success).toBe(true)
      expect(result1.newTotal).toBe(1)
      
      // Second award to same recipient should fail
      const result2 = await addReputationForReaction({
        guildId,
        messageId: generateMessageId(),
        recipient,
        reactor,
        emoji: '🏆'
      })
      
      expect(result2.success).toBe(false)
      expect(result2.error).toBe(ReputationValidationError.RECIPIENT_LIMIT_EXCEEDED)
      
      // Recipient should still have only 1 reputation
      const finalReputation = reputationService.getUserReputation(guildId, recipient.id)
      expect(finalReputation).toBe(1)
    })
  })
})