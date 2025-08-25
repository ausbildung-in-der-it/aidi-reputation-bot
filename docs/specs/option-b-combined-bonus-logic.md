# Option B: Combined Bonus Logic Architecture

## Overview

Refactor the bonus system to use a unified `awardMessageBonuses` use case that coordinates all bonuses for a message, ensuring atomic evaluation and preventing race conditions.

## Current Problems

1. **Sequential Processing**: Bonuses are evaluated independently in `onMessageCreate`
2. **No Coordination**: Daily and introduction bonuses don't know about each other
3. **Fragile State**: First bonus modifies state before second is evaluated
4. **Primary Key Conflicts**: Current workaround uses message ID suffixes

## Proposed Architecture

### New Use Case: `awardMessageBonuses`

```typescript
// src/core/usecases/awardMessageBonuses.ts
export interface MessageBonusInput {
    guildId: string;
    messageId: string;
    user: UserInfo;
    messageTimestamp?: Date;
    
    // Introduction context (if applicable)
    introductionContext?: {
        channelId: string;
        isReply: boolean;
        originalMessageId?: string;
        isThreadStarter?: boolean;
        threadOwnerId?: string;
    };
}

export interface MessageBonusResult {
    success: boolean;
    totalPoints: number;
    bonuses: Array<{
        type: 'daily' | 'introduction_post' | 'introduction_reply';
        points: number;
        awarded: boolean;
        reason: string;
    }>;
    errors: string[];
}

export async function awardMessageBonuses(input: MessageBonusInput): Promise<MessageBonusResult> {
    const bonuses = [];
    let totalPoints = 0;
    const errors = [];

    // Evaluate all bonuses WITHOUT awarding them yet
    const dailyEvaluation = await evaluateDailyBonus(input);
    const introductionEvaluation = input.introductionContext 
        ? await evaluateIntroductionBonus(input, input.introductionContext)
        : null;

    // Collect all valid bonuses
    if (dailyEvaluation.canAward) {
        bonuses.push({
            type: 'daily',
            points: dailyEvaluation.points,
            awarded: false,
            reason: dailyEvaluation.reason,
            awardFn: () => awardDailyBonusInternal(input, dailyEvaluation)
        });
    }

    if (introductionEvaluation?.canAward) {
        bonuses.push({
            type: introductionEvaluation.bonusType,
            points: introductionEvaluation.points, 
            awarded: false,
            reason: introductionEvaluation.reason,
            awardFn: () => awardIntroductionBonusInternal(input, introductionEvaluation)
        });
    }

    // Award all bonuses atomically
    const transaction = db.transaction(() => {
        for (const bonus of bonuses) {
            try {
                bonus.awardFn();
                bonus.awarded = true;
                totalPoints += bonus.points;
            } catch (error) {
                bonus.awarded = false;
                errors.push(`Failed to award ${bonus.type}: ${error.message}`);
            }
        }
    });

    try {
        transaction();
    } catch (error) {
        return {
            success: false,
            totalPoints: 0,
            bonuses: bonuses.map(b => ({ 
                type: b.type, 
                points: b.points, 
                awarded: false, 
                reason: `Transaction failed: ${error.message}` 
            })),
            errors: [`Transaction failed: ${error.message}`]
        };
    }

    return {
        success: errors.length === 0,
        totalPoints,
        bonuses: bonuses.map(b => ({ 
            type: b.type, 
            points: b.points, 
            awarded: b.awarded, 
            reason: b.reason 
        })),
        errors
    };
}
```

### Refactored Event Handler

```typescript
// src/bot/events/onMessageCreate.ts (modified)
export async function onMessageCreate(message: Message | PartialMessage) {
    // ... validation logic stays the same ...

    // Single coordinated bonus check
    const bonusResult = await awardMessageBonuses({
        guildId,
        user,
        messageId,
        messageTimestamp: message.createdAt,
        introductionContext: channel?.parent?.id ? {
            channelId: channel.parent.id,
            isReply: isThreadReply,
            originalMessageId,
            isThreadStarter,
            threadOwnerId: "ownerId" in channel ? channel.ownerId : undefined
        } : undefined
    });

    // Handle notifications for all awarded bonuses
    if (bonusResult.success && notificationService) {
        for (const bonus of bonusResult.bonuses.filter(b => b.awarded)) {
            await sendBonusNotification(bonus, user, guildId, notificationService);
        }
    }

    // Update ranks if any RP was awarded
    if (bonusResult.totalPoints > 0) {
        await updateUserRankIfNeeded(message.guild!, user, bonusResult.totalPoints);
    }
}
```

### Supporting Functions

```typescript
// src/core/usecases/evaluateDailyBonus.ts
export interface DailyBonusEvaluation {
    canAward: boolean;
    points: number;
    reason: string;
    bonusDate: string;
}

export async function evaluateDailyBonus(input: MessageBonusInput): Promise<DailyBonusEvaluation> {
    if (!DAILY_BONUS_CONFIG.enabled || input.user.isBot) {
        return { canAward: false, points: 0, reason: "Not eligible", bonusDate: "" };
    }

    const bonusCheck = dailyBonusService.checkDailyBonus(input.guildId, input.user.id);
    
    return {
        canAward: bonusCheck.canReceive,
        points: DAILY_BONUS_CONFIG.points,
        reason: bonusCheck.canReceive ? "Daily bonus available" : "Already received today",
        bonusDate: bonusCheck.bonusDate
    };
}

// src/core/usecases/evaluateIntroductionBonus.ts  
export interface IntroductionBonusEvaluation {
    canAward: boolean;
    points: number;
    bonusType: "introduction_post" | "introduction_reply";
    reason: string;
}

export async function evaluateIntroductionBonus(
    input: MessageBonusInput, 
    context: IntroductionContext
): Promise<IntroductionBonusEvaluation> {
    // Evaluation logic from current awardIntroductionBonus
    // but WITHOUT actual database writes
}
```

## Database Schema Changes

```sql
-- Clean up the message ID suffixes approach
-- All bonuses will use original message ID
-- Different bonus types distinguished by 'emoji' field
-- This is now safe because we use transactions

-- No schema changes needed! Current schema works fine with transactions
```

## Migration Strategy

1. **Phase 1**: Implement new `awardMessageBonuses` alongside existing system
2. **Phase 2**: Add feature flag to switch between old and new system
3. **Phase 3**: Update `onMessageCreate` to use new system
4. **Phase 4**: Remove old individual bonus use cases
5. **Phase 5**: Clean up message ID suffixes (optional)

## Benefits

- ✅ **Atomic Operations**: All bonuses succeed or fail together
- ✅ **Consistent State**: No partial bonus awards
- ✅ **Better Architecture**: Single responsibility for message bonuses
- ✅ **Easier Testing**: Test all bonus combinations in one place
- ✅ **Future-Proof**: Easy to add new bonus types
- ✅ **Clean Database**: No more message ID hacks

## Test Strategy

```typescript
// tests/feature/coordinatedBonusSystem.test.ts
describe("Coordinated Bonus System", () => {
    it("should award both daily and introduction bonus atomically", async () => {
        const result = await awardMessageBonuses({
            guildId,
            messageId,
            user,
            introductionContext: { 
                channelId: introChannelId,
                isReply: false,
                isThreadStarter: true
            }
        });

        expect(result.success).toBe(true);
        expect(result.totalPoints).toBe(3); // 1 daily + 2 introduction
        expect(result.bonuses).toHaveLength(2);
        
        // Verify both bonuses in database
        const events = getAllReputationEvents(guildId, user.id);
        expect(events).toHaveLength(2);
    });

    it("should rollback all bonuses if one fails", async () => {
        // Test transaction rollback behavior
    });

    it("should handle partial eligibility correctly", async () => {
        // User already got daily bonus, but eligible for intro bonus
    });
});
```

## Implementation Effort

- **Estimated Time**: 2-3 days
- **Risk Level**: Medium (database transactions)
- **Breaking Changes**: None (gradual migration)
- **Test Coverage**: High (centralized testing)