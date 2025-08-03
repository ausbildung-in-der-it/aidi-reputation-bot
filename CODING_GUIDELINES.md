# AIDI Reputation Bot - Coding Guidelines

## 📋 Projekt Überblick

Ein Discord Bot für reputation-basierte Community-Gamification. Benutzer können anderen über Reactions (🏆) Reputation-Punkte vergeben. Das System verhindert Abuse durch Rate Limiting und bietet Commands zur Reputation-Abfrage.

## 🏗️ Architektur & Struktur

### Clean Architecture Approach
```
src/
├── bot/                    # Discord.js Interface Layer
│   ├── commands/          # Slash command handlers
│   ├── events/           # Discord event handlers  
│   ├── services/         # Discord-specific services
│   └── utils/           # Discord utilities (embeds)
├── core/                  # Business Logic Layer (platform-agnostic)
│   ├── usecases/         # Use case orchestration
│   ├── services/         # Domain services
│   └── types/           # Domain types & interfaces
├── config/               # Configuration
└── db/                   # Database Layer
```

### Layer Responsibilities

#### **Discord Layer** (`src/bot/`)
- **Zuständigkeit:** Discord API Integration, Event Handling, UI (Embeds)
- **Prinzip:** Dünn halten, nur Discord-spezifische Logik
- **Beispiel:** `onReactionAdd` → Data Mapping → Core Layer aufrufen

#### **Core Layer** (`src/core/`)
- **Zuständigkeit:** Gesamte Business Logic, Domain Rules
- **Prinzip:** Platform-agnostic, keine Discord Dependencies
- **Beispiel:** Rate Limiting, Reputation Calculation, Validation

#### **Database Layer** (`src/db/`)
- **Zuständigkeit:** Data Persistence, Transactions
- **Prinzip:** Simple SQLite, kein ORM

## 💻 Coding Standards

### TypeScript Conventions
- **Interfaces:** PascalCase (`UserInfo`, `ReputationAwardResult`)
- **Enums:** PascalCase mit beschreibenden Namen (`ReputationValidationError`)
- **Functions:** camelCase, beschreibende Namen (`addReputationForReaction`)
- **Constants:** UPPER_SNAKE_CASE (`RATE_LIMIT_CONFIG`)

### Code Quality & Linting
- **Linter:** oxlint für Performance und TypeScript/Node.js Optimierung
- **Commands:** 
  - `pnpm lint` - Code auf Fehler prüfen
  - `pnpm lint:fix` - Automatische Fixes anwenden
- **Configuration:** `.oxlintrc.json` für projektspezifische Regeln
- **Unused Code:** Keine ungenutzten Imports/Variablen/Parameter
- **Naming:** Ungenutzte Parameter mit `_` prefixen (`_index`, `_name`)

### Error Handling
- **Typed Errors:** Enums für Business Logic Errors
- **Result Pattern:** `{ success: boolean, error?: ErrorType }`
- **Graceful Degradation:** Fehler loggen, nicht crashen

### Database Design
- **Event Sourcing:** `reputation_events` als single source of truth
- **Calculated Fields:** Reputation wird aus Events berechnet
- **Rate Limiting:** Separate `reputation_rate_limits` Tabelle

## 🧪 Test Strategie (DHH-Style)

### Test Philosophie
- **Feature Tests > Unit Tests** (80/15/5 Verteilung)
- **Real Dependencies:** In-memory SQLite, echte Services
- **Minimal Mocking:** Nur Config und Discord API
- **User Journey Focus:** Teste das Verhalten, nicht die Implementation

### Test Struktur
```
tests/
├── feature/              # 80% - End-to-end user journeys
│   ├── userGivesReputation.test.ts
│   ├── userChecksReputation.test.ts
│   └── userViewsLeaderboard.test.ts
├── integration/          # 15% - Service combinations  
└── unit/                # 5% - Critical isolated logic
```

### Test Approach
1. **Setup:** Real in-memory DB, mock nur Config
2. **Action:** Simuliere User-Aktionen
3. **Assert:** Prüfe Endergebnis und Side Effects

### Example Feature Test
```typescript
describe('User gives reputation', () => {
  it('should complete full reputation award workflow', async () => {
    // Setup: Create users and test environment
    const author = createTestUser('author_123')
    const reactor = createTestUser('reactor_456')
    
    // Action: User reacts with trophy
    const result = await addReputationForReaction({
      guildId, messageId, recipient: author, reactor, emoji: '🏆'
    })
    
    // Assert: Award succeeded and is persisted
    expect(result.success).toBe(true)
    expect(reputationService.getUserReputation(guildId, author.id)).toBe(1)
  })
})
```

## 🔄 Development Workflow

### TDD Cycle
1. **Red:** Test schreiben → ausführen → fehlschlagen sehen
2. **Green:** Minimalen Code schreiben um Test zu bestehen
3. **Refactor:** Code verbessern ohne Tests zu brechen
4. **Repeat:** Nächsten Test schreiben

### Code Review Checklist
- [ ] Business Logic in Core Layer (nicht Discord Layer)
- [ ] Typed Errors statt Strings
- [ ] Feature Test für User Journey vorhanden
- [ ] Keine Secrets oder Magic Numbers
- [ ] Performance: Database Transactions für Multi-Step Operations
- [ ] Code Quality: `pnpm lint` läuft ohne Fehler

## 🚀 Deployment & Config

### Environment Variables
```bash
DISCORD_TOKEN=xxx
DISCORD_CLIENT_ID=xxx
```

### Database
- SQLite für Entwicklung und Production
- In-memory für Tests
- Automatic schema creation

### Rate Limiting Configuration
```typescript
// src/config/reputation.ts
export const RATE_LIMIT_CONFIG = {
  dailyLimit: 5,           // Max awards per user per 24h
  perRecipientLimit: 1,    // Max awards to same user per 24h  
  windowHours: 24          // Sliding window
}
```

## 🎯 Best Practices

### Do's ✅
- **Separation of Concerns:** Discord ≠ Business Logic
- **Feature Tests:** Test user behavior end-to-end
- **Type Safety:** Nutze TypeScript's type system voll aus
- **Real Dependencies:** Minimale Mocks in Tests
- **Immutable Config:** Konfiguration in Code, nicht DB

### Don'ts ❌
- **God Objects:** Keine fetten Service-Klassen
- **Mocking Everything:** Nur Mock was nötig ist
- **Magic Strings:** Nutze Enums und Constants
- **Business Logic in Discord Layer:** Halte es dünn
- **Brittle Tests:** Teste Verhalten, nicht Implementation

## 📊 Success Metrics

### Code Quality
- **Test Coverage:** Core Logic >90%, Commands >85%
- **Type Coverage:** 100% TypeScript strict mode
- **Cyclomatic Complexity:** <10 per function

### Performance
- **Feature Tests:** <100ms per test
- **Discord Response:** <200ms für Commands
- **Database Operations:** Transactional consistency

---

*Last Updated: January 2025*
*Project: AIDI Reputation Bot v1.0*