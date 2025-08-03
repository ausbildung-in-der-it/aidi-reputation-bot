# Architecture Improvements für bessere Developer Experience

## 🎯 Ziel

Maximale Developer Experience durch vorhersagbare, selbstdokumentierende Architektur-Patterns.

## 📊 Aktuelle Architektur Assessment

### ✅ Stärken

- **Exzellente Clean Architecture** - Klare Schichtentrennung zwischen Discord/Core/DB
- **Platform-agnostic Business Logic** - Core Layer ohne Discord Dependencies
- **Starke Domain Abstraktion** - `UserInfo`, `ReputationValidationError` Enums
- **Feature-Test-driven Development** - DHH-Style Testing mit real dependencies
- **Immutable Configuration** - Config in Code, nicht DB
- **Event Sourcing Pattern** - `reputation_events` als single source of truth

### 🔄 Architektur-Schwächen für DX

#### 1. **Inkonsistente Error Handling Patterns**

```typescript
// Aktuell: Verschiedene Error Patterns
addReputationForReaction() → ReputationAwardResult { success: boolean, error?: ... }
removeReputationForReaction() → void (wirft keine Errors)
handleReputationCommand() → try/catch mit console.error

// Problem: Entwickler müssen sich 3 verschiedene Patterns merken
```

#### 2. **Anemic Domain Services**

```typescript
// Aktuell: Nur Function Container ohne Business Logic
export const reputationService = {
  getUserReputation: (guildId, userId) => {
    /* SQL */
  },
  trackReputationReaction: input => {
    /* SQL */
  },
};

// Problem: Business Logic verstreut zwischen Services und Use Cases
```

#### 3. **Type Safety nicht maximal ausgeschöpft**

```typescript
// Aktuell: Unsafe Type Casting
const result = stmt.get(guildId, userId) as { total: number | null };

// Problem: Runtime Type Safety nicht garantiert, potentielle Bugs
```

#### 4. **Business Rules an mehreren Stellen**

```typescript
// Rate Limiting Logic sowohl in:
// 1. rateLimitService.checkLimits()
// 2. addReputationForReaction Use Case
// 3. Potentiell in Commands für User Feedback

// Problem: Änderungen an Business Rules erfordern mehrere Code-Stellen
```

## 🚀 Geplante Architektur-Verbesserungen

### 1. **Consistent Result Pattern Implementation**

#### Neues `Result<T, E>` Type System

```typescript
// src/core/types/Result.ts
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

export const Result = {
  ok: <T>(data: T): Result<T, never> => ({ success: true, data }),
  err: <E>(error: E): Result<never, E> => ({ success: false, error }),
};
```

#### Alle Use Cases einheitlich

```typescript
// Vorher: addReputationForReaction → ReputationAwardResult
// Nachher: addReputationForReaction → Result<ReputationAward, ReputationError>

export async function addReputationForReaction(
  input: ReputationRequest
): Promise<Result<ReputationAward, ReputationError>> {
  // Einheitliche Error Handling
}

export async function removeReputationForReaction(
  input: ReputationRemovalRequest
): Promise<Result<void, ReputationError>> {
  // Gleiche Pattern wie add
}
```

### 2. **Rich Domain Objects statt Primitives**

#### Value Objects für Business Concepts

```typescript
// src/core/domain/ReputationEvent.ts
export class ReputationEvent {
  constructor(
    public readonly guildId: GuildId,
    public readonly messageId: MessageId,
    public readonly recipient: UserInfo,
    public readonly reactor: UserInfo,
    public readonly emoji: ReputationEmoji,
    public readonly points: Points,
    public readonly timestamp: Timestamp
  ) {}

  static fromReaction(reaction: ReactionInput): Result<ReputationEvent, ValidationError> {
    // Domain Logic hier, nicht in Services
  }
}

// src/core/domain/LeaderboardEntry.ts
export class LeaderboardEntry {
  constructor(
    public readonly user: UserInfo,
    public readonly reputation: Points,
    public readonly rank: Rank
  ) {}
}

// src/core/domain/RateLimitWindow.ts
export class RateLimitWindow {
  constructor(
    private readonly config: RateLimitConfig,
    private readonly windowStart: Timestamp
  ) {}

  canAward(existing: ReputationEvent[]): Result<void, RateLimitError> {
    // Alle Rate Limit Logic hier gekapselt
  }
}
```

### 3. **Repository Pattern für Data Access**

#### Interface-basierte Data Layer

```typescript
// src/core/repositories/IReputationRepository.ts
export interface IReputationRepository {
  getUserReputation(guildId: GuildId, userId: UserId): Promise<Points>;
  getLeaderboard(guildId: GuildId, limit: number): Promise<LeaderboardEntry[]>;
  saveReputationEvent(event: ReputationEvent): Promise<Result<void, DatabaseError>>;
  removeReputationEvent(criteria: EventCriteria): Promise<Result<void, DatabaseError>>;
  getReputationHistory(guildId: GuildId, userId: UserId): Promise<ReputationEvent[]>;
}

// src/infrastructure/repositories/SqliteReputationRepository.ts
export class SqliteReputationRepository implements IReputationRepository {
  // SQLite Implementation Details hier
  // Services kennen nur das Interface
}
```

### 4. **Centralized Business Rules**

#### Domain Services für Business Logic

```typescript
// src/core/domain/ReputationRules.ts
export class ReputationRules {
  static validateReputationAward(
    recipient: UserInfo,
    reactor: UserInfo,
    emoji: string
  ): Result<void, ReputationValidationError> {
    // Alle Validation Rules hier
    if (recipient.id === reactor.id) {
      return Result.err(ReputationValidationError.SELF_AWARD);
    }
    // ... etc
  }
}

// src/core/domain/RateLimitPolicy.ts
export class RateLimitPolicy {
  constructor(private config: RateLimitConfig) {}

  checkLimits(reactor: UserInfo, recipient: UserInfo, recentEvents: ReputationEvent[]): Result<void, RateLimitError> {
    // Alle Rate Limit Logic hier gekapselt
  }
}
```

### 5. **Type-Safe Database Layer**

#### Strongly Typed Database Results

```typescript
// src/core/types/DatabaseTypes.ts
export interface ReputationQueryResult {
  total: number;
}

export interface LeaderboardQueryResult {
  to_user_id: string;
  total: number;
}

// Verwende branded types für IDs
export type GuildId = string & { readonly brand: unique symbol };
export type UserId = string & { readonly brand: unique symbol };
export type MessageId = string & { readonly brand: unique symbol };
```

## 📋 Implementation Roadmap

### Phase 1: Foundation Types

- [ ] `Result<T, E>` Type System
- [ ] Branded Types für IDs
- [ ] Domain Error Types
- [ ] Value Objects (ReputationEvent, etc.)

### Phase 2: Repository Pattern

- [ ] `IReputationRepository` Interface
- [ ] `SqliteReputationRepository` Implementation
- [ ] Services refactoring auf Repository

### Phase 3: Domain Services

- [ ] `ReputationRules` Domain Service
- [ ] `RateLimitPolicy` Domain Service
- [ ] Business Logic aus Use Cases extrahieren

### Phase 4: Consistent Error Handling

- [ ] Alle Use Cases auf `Result<T, E>` Pattern
- [ ] Commands Error Handling vereinheitlichen
- [ ] Error Propagation Testing

### Phase 5: Rich Domain Objects

- [ ] `LeaderboardEntry` Implementation
- [ ] `RateLimitWindow` Implementation
- [ ] Domain Object Integration Testing

## 🎯 Expected DX Improvements

### Vorher: Developer muss sich merken

```typescript
// 3 verschiedene Error Patterns
const result1 = await addReputationForReaction(...)  // ReputationAwardResult
await removeReputationForReaction(...)               // void, kann crashen
try { await handleCommand(...) } catch(e) { ... }   // Exception-based
```

### Nachher: Einheitliches Pattern überall

```typescript
// Konsistent überall das gleiche Pattern
const addResult = await addReputationForReaction(...)     // Result<ReputationAward, Error>
const removeResult = await removeReputationForReaction(...) // Result<void, Error>
const commandResult = await handleCommand(...)            // Result<CommandResponse, Error>

// Entwickler lernt EIN Pattern, kann es überall anwenden
```

### Bessere IDE Support

- **Autocomplete** für Domain Objects statt primitive strings
- **Type Safety** verhindert Runtime Errors
- **Self-documenting Code** durch Rich Types
- **Refactoring Safety** durch Interface-basierte Architecture

---

_Erstellt: Januar 2025_  
_Status: Specification - Ready for Implementation_
