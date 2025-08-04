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

### Code Formatting

- **Formatter:** Prettier für konsistente Code-Formatierung
- **Style:**
  - **Tabs:** 4-Zeichen Tabs statt Spaces
  - **Quotes:** Doppelte Anführungszeichen (") für alle Strings
  - **Line Length:** 120 Zeichen Maximum
  - **Semicolons:** Immer verwenden
- **Commands:**
  - `pnpm format` - Gesamte Codebase formatieren
  - `pnpm format:check` - Formatierung prüfen ohne ändern
  - `pnpm format:staged` - Nur staged Files formatieren
- **VSCode Integration:** Format on save aktiviert über `.vscode/settings.json`

### Error Handling

- **Typed Errors:** Enums für Business Logic Errors
- **Result Pattern:** `{ success: boolean, error?: ErrorType }`
- **Graceful Degradation:** Fehler loggen, nicht crashen

### Database Design

- **Event Sourcing:** `reputation_events` als single source of truth
- **Calculated Fields:** Reputation wird aus Events berechnet
- **Rate Limiting:** Separate `reputation_rate_limits` Tabelle

### Database Migrations (Live-Safe Strategy)

⚠️ **WICHTIG:** Die Anwendung läuft LIVE. Migrations müssen 100% rückwärtskompatibel sein.

#### Migration Prinzipien (Laravel-Style)

- **Forward-Only:** Nur additive Änderungen, nie destructive
- **Incremental:** Kleine, atomare Schema-Änderungen
- **Resilient:** Schema-Änderungen dürfen nie die App crashen
- **Zero-Downtime:** Migrations laufen während die App online ist

#### ✅ Erlaubte Migration-Operationen

```sql
-- ✅ Neue Tabellen hinzufügen
CREATE TABLE IF NOT EXISTS new_feature_table (...)

-- ✅ Neue Spalten hinzufügen (mit DEFAULT)
ALTER TABLE existing_table ADD COLUMN new_field TEXT DEFAULT 'default_value'

-- ✅ Neue Indices hinzufügen
CREATE INDEX IF NOT EXISTS idx_performance ON table_name (column)

-- ✅ Neue Constraints hinzufügen (mit IF NOT EXISTS Pattern)
-- Nur wenn sie nicht Breaking sind
```

#### ❌ VERBOTENE Migration-Operationen

```sql
-- ❌ NIE: Tabellen löschen
DROP TABLE old_table

-- ❌ NIE: Spalten löschen
ALTER TABLE table DROP COLUMN old_column

-- ❌ NIE: Spalten umbenennen
ALTER TABLE table RENAME COLUMN old TO new

-- ❌ NIE: Datentypen ändern ohne Kompatibilität
ALTER TABLE table ALTER COLUMN field TYPE new_type

-- ❌ NIE: NOT NULL Constraints auf bestehende Spalten
ALTER TABLE table ALTER COLUMN field SET NOT NULL
```

#### Migration Workflow

1. **Schema erweitern:** Neue Tabellen/Spalten hinzufügen
2. **Code anpassen:** Neue und alte Struktur parallel unterstützen
3. **Data Migration:** Background-Jobs für Daten-Umzug (falls nötig)
4. **Cleanup:** Alte Strukturen erst nach Wochen/Monaten deprecaten

#### Beispiel: Feature hinzufügen

```typescript
// ✅ Migration: Neue Tabelle in schema.ts
db.exec(`
  CREATE TABLE IF NOT EXISTS new_feature_config (
    guild_id TEXT NOT NULL PRIMARY KEY,
    setting_value TEXT NOT NULL DEFAULT 'default',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// ✅ Service: Graceful Fallbacks
const getFeatureSetting = (guildId: string) => {
  try {
    const result = stmt.get(guildId);
    return result?.setting_value || "default";
  } catch (error) {
    console.error("Feature config error:", error);
    return "default"; // Graceful degradation
  }
};
```

## 🧪 Test Strategie (DHH-Style)

### Test Philosophie

- **Feature Tests > Unit Tests** (80/15/5 Verteilung)
- **Real Dependencies:** In-memory SQLite, echte Services
- **Minimal Mocking:** Nur Config und Discord API
- **User Journey Focus:** Teste das Verhalten, nicht die Implementation
- **Test-First Development:** Feature Test vor Implementation schreiben

### Test-First Development Prozess

#### 1. Feature Test zuerst schreiben

```typescript
// ❌ Test schlägt fehl - Feature existiert noch nicht
describe("User configures notification channel", () => {
  it("should send notifications when RP is earned", async () => {
    // Arrange: Setup test environment
    await configureNotificationChannel({
      guildId: "test_guild",
      channelId: "test_channel",
      configuredBy: admin,
    });

    // Act: Award reputation (triggers notification)
    const result = await addReputationForReaction({
      guildId: "test_guild",
      recipient: testUser,
      reactor: giver,
      emoji: "🏆",
    });

    // Assert: Notification should be sent
    expect(result.success).toBe(true);
    const notification = notificationService.notify({
      type: "trophy_given",
      guildId: "test_guild",
      userId: giver.id,
      userName: giver.displayName,
      points: 1,
    });
    expect(notification).not.toBeNull();
  });
});
```

#### 2. Minimale Implementation für Green

```typescript
// ✅ Minimal implementierung um Test zu bestehen
export const notificationService = {
  notify: () => ({ channelId: "test", message: "test" }),
};
```

#### 3. Refactor zu vollständiger Lösung

```typescript
// ✅ Vollständige, production-ready Implementation
export const notificationService = {
  notify: (event: NotificationEvent) => {
    const config = getChannelConfig(event.guildId);
    if (!config?.enabled) return null;

    return {
      channelId: config.channelId,
      message: formatMessage(event),
    };
  },
};
```

#### 4. Edge Cases als zusätzliche Tests

```typescript
it("should return null when notifications disabled", () => {
  // Test für deaktivierte Notifications
});

it("should handle missing channel gracefully", () => {
  // Test für Error-Handling
});
```

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
describe("User gives reputation", () => {
  it("should complete full reputation award workflow", async () => {
    // Setup: Create users and test environment
    const author = createTestUser("author_123");
    const reactor = createTestUser("reactor_456");

    // Action: User reacts with trophy
    const result = await addReputationForReaction({
      guildId,
      messageId,
      recipient: author,
      reactor,
      emoji: "🏆",
    });

    // Assert: Award succeeded and is persisted
    expect(result.success).toBe(true);
    expect(reputationService.getUserReputation(guildId, author.id)).toBe(1);
  });
});
```

## 🔄 Development Workflow

### Feature Development (Live-Safe)

#### 1. Planning & Test-First

```bash
# 1. Feature Test schreiben (failing)
touch tests/feature/newFeature.test.ts
pnpm test tests/feature/newFeature.test.ts # ❌ Red

# 2. DB Migration (if needed) - nur additive Änderungen
# Schema in src/db/schema.ts erweitern
```

#### 2. Implementation

```bash
# 3. Core Logic implementieren
mkdir -p src/core/services src/core/usecases

# 4. Minimal Implementation für Green
pnpm test tests/feature/newFeature.test.ts # ✅ Green

# 5. Discord Layer Integration (falls nötig)
# Bot commands, event handlers

# 6. Refactor & Polish
pnpm test tests/feature/newFeature.test.ts # ✅ Still Green
```

#### 3. Quality Gates

```bash
# 7. Alle Tests laufen durch
pnpm test --run

# 8. Linting ohne Fehler
pnpm lint

# 9. Format Check
pnpm format:check
```

### TDD Cycle (Red-Green-Refactor)

1. **Red:** Feature Test schreiben → ausführen → fehlschlagen sehen
2. **Green:** Minimalen Code schreiben um Test zu bestehen
3. **Refactor:** Code verbessern ohne Tests zu brechen
4. **Repeat:** Edge Cases als weitere Tests hinzufügen

### Code Review Checklist

#### Architektur & Design

- [ ] Business Logic in Core Layer (nicht Discord Layer)
- [ ] Clean Architecture Layers respektiert
- [ ] Typed Errors statt Strings
- [ ] Graceful Error Handling implementiert

#### Database & Migrations

- [ ] **Nur additive DB-Änderungen** (CREATE TABLE IF NOT EXISTS, ADD COLUMN)
- [ ] **Keine destructive Operationen** (DROP, DELETE, ALTER TYPE)
- [ ] Default-Werte für neue Spalten definiert
- [ ] Graceful Fallbacks für fehlende Konfigurationen

#### Testing

- [ ] **Feature Test vor Implementation geschrieben**
- [ ] User Journey vollständig getestet
- [ ] Edge Cases abgedeckt (disabled features, missing data)
- [ ] Keine Mocks für Datenbank (echte SQLite)

#### Code Quality

- [ ] Performance: Database Transactions für Multi-Step Operations
- [ ] Keine Secrets oder Magic Numbers
- [ ] TypeScript strict mode ohne Fehler
- [ ] Linting (`pnpm lint`) läuft ohne Fehler
- [ ] Formatting (`pnpm format:check`) korrekt

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
  dailyLimit: 5, // Max awards per user per 24h
  perRecipientLimit: 1, // Max awards to same user per 24h
  windowHours: 24, // Sliding window
};
```

## 🎯 Best Practices

### Do's ✅

- **Separation of Concerns:** Discord ≠ Business Logic
- **Feature Tests:** Test user behavior end-to-end
- **Type Safety:** Nutze TypeScript's type system voll aus
- **Real Dependencies:** Minimale Mocks in Tests
- **Immutable Config:** Konfiguration in Code, nicht DB
- **Test-First Development:** Feature Test vor Implementation
- **Live-Safe Migrations:** Nur additive DB-Änderungen
- **Graceful Degradation:** Features dürfen fehlschlagen ohne App-Crash

### Don'ts ❌

- **God Objects:** Keine fetten Service-Klassen
- **Mocking Everything:** Nur Mock was nötig ist
- **Magic Strings:** Nutze Enums und Constants
- **Business Logic in Discord Layer:** Halte es dünn
- **Brittle Tests:** Teste Verhalten, nicht Implementation
- **Destructive Migrations:** NIE bestehende Daten/Strukturen löschen
- **Implementation-First:** Nie Code vor Tests schreiben
- **Breaking Changes:** Rückwärtskompatibilität ist heilig

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

_Last Updated: January 2025_
_Project: AIDI Reputation Bot v1.0_
