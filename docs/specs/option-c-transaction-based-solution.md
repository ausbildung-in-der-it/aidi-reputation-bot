# Option C: Transaction-Based Solution with Schema Evolution

## Overview

Implement a robust, transaction-based bonus system with proper database schema design that eliminates primary key conflicts and ensures ACID compliance for all reputation operations.

## Current Problems

1. **Flawed Primary Key Design**: `(guild_id, message_id, from_user_id)` doesn't support multiple system bonuses
2. **Silent Failures**: `INSERT OR IGNORE` masks constraint violations
3. **No Atomicity**: Bonuses are awarded independently without transaction guarantees
4. **Message ID Hacks**: Current fix uses artificial message ID suffixes

## Proposed Architecture

### Database Schema Evolution

```sql
-- src/db/migrations/001_fix_reputation_events_schema.sql
-- STEP 1: Create new table with better primary key design

CREATE TABLE IF NOT EXISTS reputation_events_v2 (
    -- Unique identifier for each reputation event
    event_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    
    -- Core event data  
    guild_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    from_user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 1,
    
    -- Event metadata
    event_type TEXT NOT NULL CHECK (event_type IN (
        'reaction', 'daily_bonus', 'introduction_bonus', 'admin_award', 'invite_reward'
    )),
    source_type TEXT, -- 'user_reaction', 'system_bonus', 'admin_command'
    
    -- Timestamps
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Context data (JSON for flexibility)
    context TEXT, -- JSON string for bonus-specific data
    
    -- Indexes for common queries
    INDEX idx_guild_user (guild_id, to_user_id),
    INDEX idx_message (guild_id, message_id),
    INDEX idx_event_type (guild_id, event_type),
    INDEX idx_created_at (created_at)
);

-- STEP 2: Migrate existing data
INSERT INTO reputation_events_v2 (
    guild_id, message_id, to_user_id, from_user_id, 
    emoji, amount, event_type, source_type, created_at
)
SELECT 
    guild_id, 
    message_id,
    to_user_id,
    from_user_id,
    emoji,
    amount,
    CASE 
        WHEN from_user_id = 'system' AND emoji = 'daily_bonus' THEN 'daily_bonus'
        WHEN from_user_id = 'system' AND emoji IN ('introduction_post', 'forum_post') THEN 'introduction_bonus'
        WHEN from_user_id = 'system' AND emoji = 'introduction_reply' THEN 'introduction_bonus'
        ELSE 'reaction'
    END as event_type,
    CASE 
        WHEN from_user_id = 'system' THEN 'system_bonus'
        ELSE 'user_reaction'  
    END as source_type,
    created_at
FROM reputation_events;

-- STEP 3: Drop old table and rename (after verification)
-- DROP TABLE reputation_events;
-- ALTER TABLE reputation_events_v2 RENAME TO reputation_events;
```

### Enhanced Reputation Service

```typescript
// src/core/services/reputationService.ts (refactored)
export interface ReputationEvent {
    eventId?: string; // Auto-generated if not provided
    guildId: string;
    messageId: string;
    toUserId: string;
    fromUserId: string;
    emoji: string;
    amount: number;
    eventType: 'reaction' | 'daily_bonus' | 'introduction_bonus' | 'admin_award' | 'invite_reward';
    sourceType: 'user_reaction' | 'system_bonus' | 'admin_command';
    context?: Record<string, any>; // Bonus-specific metadata
}

export const reputationServiceV2 = {
    /**
     * Award multiple reputation events atomically
     */
    awardMultipleEvents: (events: ReputationEvent[]): { success: boolean; eventIds: string[]; error?: string } => {
        const transaction = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO reputation_events (
                    guild_id, message_id, to_user_id, from_user_id, 
                    emoji, amount, event_type, source_type, context
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const eventIds: string[] = [];
            
            for (const event of events) {
                const result = stmt.run(
                    event.guildId,
                    event.messageId, 
                    event.toUserId,
                    event.fromUserId,
                    event.emoji,
                    event.amount,
                    event.eventType,
                    event.sourceType,
                    event.context ? JSON.stringify(event.context) : null
                );
                
                // Get the auto-generated event_id
                const eventId = db.prepare(
                    "SELECT event_id FROM reputation_events WHERE rowid = ?"
                ).get(result.lastInsertRowid) as { event_id: string };
                
                eventIds.push(eventId.event_id);
            }
            
            return eventIds;
        });

        try {
            const eventIds = transaction();
            return { success: true, eventIds };
        } catch (error) {
            console.error('Failed to award reputation events:', error);
            return { 
                success: false, 
                eventIds: [], 
                error: error.message 
            };
        }
    },

    /**
     * Get user reputation with breakdown by event type
     */
    getUserReputationDetailed: (guildId: string, userId: string) => {
        const stmt = db.prepare(`
            SELECT 
                event_type,
                SUM(amount) as total,
                COUNT(*) as count
            FROM reputation_events
            WHERE guild_id = ? AND to_user_id = ?
            GROUP BY event_type
        `);
        
        const breakdown = stmt.all(guildId, userId) as Array<{
            event_type: string;
            total: number;
            count: number;
        }>;

        const total = breakdown.reduce((sum, item) => sum + item.total, 0);

        return {
            total,
            breakdown: breakdown.reduce((acc, item) => {
                acc[item.event_type] = { total: item.total, count: item.count };
                return acc;
            }, {} as Record<string, { total: number; count: number }>)
        };
    },

    /**
     * Check if user has received specific bonus types
     */
    hasUserReceivedBonusType: (guildId: string, userId: string, eventType: string): boolean => {
        const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM reputation_events
            WHERE guild_id = ? AND to_user_id = ? AND event_type = ?
        `);
        const result = stmt.get(guildId, userId, eventType) as { count: number };
        return Number(result.count) > 0;
    }
};
```

### Transactional Bonus Coordinator

```typescript
// src/core/usecases/awardMessageBonusesV2.ts
export interface BonusEvaluation {
    eligible: boolean;
    bonusType: string;
    points: number;
    reason: string;
    context?: Record<string, any>;
}

export async function awardMessageBonusesV2(input: MessageBonusInput): Promise<MessageBonusResult> {
    // Phase 1: Evaluate all potential bonuses (read-only)
    const evaluations: Array<BonusEvaluation & { evaluator: string }> = [];
    
    // Daily bonus evaluation
    const dailyEval = await evaluateDailyBonusV2(input);
    if (dailyEval.eligible) {
        evaluations.push({ ...dailyEval, evaluator: 'daily' });
    }

    // Introduction bonus evaluation  
    if (input.introductionContext) {
        const introEval = await evaluateIntroductionBonusV2(input, input.introductionContext);
        if (introEval.eligible) {
            evaluations.push({ ...introEval, evaluator: 'introduction' });
        }
    }

    // Future: Other bonus types can be added here
    // - Weekly bonus
    // - Streak bonus
    // - Special event bonuses
    
    if (evaluations.length === 0) {
        return {
            success: true,
            totalPoints: 0,
            bonuses: [],
            errors: []
        };
    }

    // Phase 2: Convert evaluations to reputation events
    const events: ReputationEvent[] = evaluations.map(eval => ({
        guildId: input.guildId,
        messageId: input.messageId, // Use original message ID - no more hacks!
        toUserId: input.user.id,
        fromUserId: 'system',
        emoji: getBonusEmoji(eval.bonusType),
        amount: eval.points,
        eventType: getBonusEventType(eval.bonusType),
        sourceType: 'system_bonus',
        context: {
            bonusType: eval.bonusType,
            reason: eval.reason,
            evaluator: eval.evaluator,
            messageTimestamp: input.messageTimestamp?.toISOString(),
            ...eval.context
        }
    }));

    // Phase 3: Award all bonuses atomically
    const awardResult = reputationServiceV2.awardMultipleEvents(events);
    
    if (!awardResult.success) {
        return {
            success: false,
            totalPoints: 0,
            bonuses: evaluations.map(eval => ({
                type: eval.bonusType,
                points: eval.points,
                awarded: false,
                reason: `Transaction failed: ${awardResult.error}`
            })),
            errors: [awardResult.error || 'Unknown transaction error']
        };
    }

    // Phase 4: Update tracking tables (also transactional)
    const trackingResult = await updateBonusTracking(evaluations, input);
    
    if (!trackingResult.success) {
        // This is problematic - reputation was awarded but tracking failed
        console.error('CRITICAL: Reputation awarded but tracking failed:', trackingResult.error);
        // In production, we might want to implement compensation logic
    }

    return {
        success: true,
        totalPoints: evaluations.reduce((sum, eval) => sum + eval.points, 0),
        bonuses: evaluations.map(eval => ({
            type: eval.bonusType,
            points: eval.points,
            awarded: true,
            reason: eval.reason
        })),
        errors: trackingResult.success ? [] : [trackingResult.error]
    };
}
```

### Migration Service

```typescript
// src/db/migrations/migrationService.ts
export class MigrationService {
    private static migrations = [
        {
            version: 1,
            name: 'fix_reputation_events_schema',
            up: async (db: Database.Database) => {
                // Create new table with better schema
                await this.createReputationEventsV2(db);
                
                // Migrate data
                await this.migrateReputationEvents(db);
                
                // Verify migration
                await this.verifyMigration(db);
            },
            down: async (db: Database.Database) => {
                // Rollback logic if needed
                db.exec('DROP TABLE IF EXISTS reputation_events_v2');
            }
        }
    ];

    static async runMigrations(db: Database.Database): Promise<void> {
        // Create migrations table
        db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const appliedMigrations = db.prepare(
            'SELECT version FROM schema_migrations ORDER BY version'
        ).all() as Array<{ version: number }>;

        const appliedVersions = new Set(appliedMigrations.map(m => m.version));

        for (const migration of this.migrations) {
            if (!appliedVersions.has(migration.version)) {
                console.log(`Applying migration ${migration.version}: ${migration.name}`);
                
                try {
                    await migration.up(db);
                    
                    // Record successful migration
                    db.prepare(`
                        INSERT INTO schema_migrations (version, name)
                        VALUES (?, ?)
                    `).run(migration.version, migration.name);
                    
                    console.log(`✅ Migration ${migration.version} completed`);
                } catch (error) {
                    console.error(`❌ Migration ${migration.version} failed:`, error);
                    
                    // Attempt rollback
                    try {
                        await migration.down(db);
                        console.log(`🔄 Migration ${migration.version} rolled back`);
                    } catch (rollbackError) {
                        console.error(`💥 Rollback failed:`, rollbackError);
                    }
                    
                    throw error;
                }
            }
        }
    }
}
```

## Deployment Strategy

### Phase 1: Parallel Schema (Zero Downtime)
```typescript
// Both tables exist side-by-side
// New events go to both tables
// Reads come from old table
// Verification runs comparing both tables
```

### Phase 2: Feature Flag Migration
```typescript
// src/config/features.ts
export const FEATURES = {
    USE_TRANSACTIONAL_BONUSES: process.env.FEATURE_TRANSACTIONAL_BONUSES === 'true'
};

// Gradual rollout with ability to rollback
if (FEATURES.USE_TRANSACTIONAL_BONUSES) {
    return await awardMessageBonusesV2(input);
} else {
    return await awardMessageBonusesLegacy(input);
}
```

### Phase 3: Full Cutover
```typescript
// Remove feature flag
// Switch all reads to new table
// Drop old table after safety period
```

## Benefits

- ✅ **True ACID Compliance**: All operations are atomic, consistent, isolated, durable
- ✅ **Proper Schema Design**: Event ID primary key eliminates conflicts
- ✅ **Audit Trail**: Every reputation change is tracked with full context
- ✅ **Rollback Capability**: Failed transactions are automatically rolled back
- ✅ **Scalable**: Easy to add new bonus types without schema changes
- ✅ **Zero Downtime**: Migration can be done without service interruption
- ✅ **Data Integrity**: No more silent failures or partial states

## Risk Assessment

### High Risk Items
- **Schema Migration**: Requires careful coordination
- **Transaction Deadlocks**: Multiple simultaneous bonuses could conflict
- **Performance**: Transactions may be slower than simple inserts

### Mitigation Strategies
- **Comprehensive Testing**: Test all migration scenarios
- **Feature Flags**: Gradual rollout with instant rollback capability
- **Monitoring**: Track transaction performance and failure rates
- **Circuit Breaker**: Fall back to legacy system if transaction failure rate exceeds threshold

## Test Strategy

```typescript
// tests/integration/transactionalBonuses.test.ts
describe("Transactional Bonus System", () => {
    describe("Atomicity", () => {
        it("should award all bonuses or none", async () => {
            // Mock a failure in the middle of transaction
            // Verify no partial awards
        });

        it("should handle concurrent bonus awards correctly", async () => {
            // Multiple users posting simultaneously
            // Verify no race conditions
        });
    });

    describe("Migration", () => {
        it("should migrate all existing data correctly", async () => {
            // Populate old schema
            // Run migration
            // Verify data integrity
        });

        it("should handle migration rollback", async () => {
            // Test rollback scenarios
        });
    });
});
```

## Performance Considerations

### Expected Impact
- **Writes**: 10-20% slower due to transaction overhead
- **Reads**: 5-10% faster due to better indexing
- **Memory**: Slightly higher due to transaction isolation

### Optimization Strategies
- **Batch Processing**: Group multiple bonus awards when possible
- **Connection Pooling**: Reuse database connections
- **Read Replicas**: Separate read/write workloads if needed

## Implementation Timeline

- **Week 1**: Database schema design and migration code
- **Week 2**: New reputation service implementation  
- **Week 3**: Transactional bonus coordinator
- **Week 4**: Migration tooling and testing
- **Week 5**: Integration testing and performance validation
- **Week 6**: Production deployment with feature flags
- **Week 7**: Monitoring and gradual rollout
- **Week 8**: Full cutover and cleanup

**Total Effort**: ~8 weeks with 1 developer
**Risk Level**: High (schema changes)
**Benefits**: Maximum architectural improvement