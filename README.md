# Discord Reputation Bot

Ein Discord-Bot für die Verwaltung von Benutzer-Reputation und Rängen in Discord-Servern.

## Lizenz

Dieses Projekt ist unter der [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](http://creativecommons.org/licenses/by-nc-sa/4.0/) lizenziert.

- ✅ Du kannst den Bot verwenden, bearbeiten und teilen
- ❌ Kommerzielle Nutzung ist nicht gestattet
- 📝 Namensnennung erforderlich
- 🔄 Abgeleitete Werke unter gleicher Lizenz teilen

## Features

- **Reputation System** - Punkte vergeben durch 🏆 Emoji-Reaktionen
- **Benutzer-Ranglisten** - Guild-spezifische Reputation-Rankings
- **Rang-Management** - Automatische Rollenzuweisung basierend auf Reputation
- **Einführungskanal** - Bonus-Punkte für Forum-Einführungen und Antworten
- **Täglicher Bonus** - Tägliches Bonus-System
- **Rate Limiting** - Missbrauchsschutz (5 Vergaben/Tag, 1 pro Empfänger pro Tag)
- **Einladungs-Tracking** - Verfolgung und Belohnung von Benutzereinladungen

## Schnellstart

### Voraussetzungen

- Docker und Docker Compose
- Discord Bot Token und Client ID

### Setup

1. **Repository klonen und konfigurieren:**

   ```bash
   git clone https://github.com/yourusername/aidi-reputation-bot
   cd aidi-reputation-bot
   cp .env.example .env
   ```

2. **`.env` Datei bearbeiten:**

   ```bash
   DISCORD_TOKEN=dein_discord_bot_token_hier
   DISCORD_CLIENT_ID=deine_discord_client_id_hier
   ```

3. **Bot starten:**

   ```bash
   docker-compose up --build -d
   ```

4. **Logs prüfen:**
   ```bash
   docker-compose logs -f bot
   ```

### Lokale Entwicklung

```bash
# Dependencies installieren
pnpm install

# Development Server starten
pnpm dev

# Tests ausführen
pnpm test

# Für Produktion bauen
pnpm build
```

## Docker Deployment

### Produktions-Deployment

```bash
# Bauen und starten
docker-compose up --build -d

# Logs anzeigen
docker-compose logs -f bot

# Stoppen
docker-compose down

# Update und Neustart
docker-compose pull && docker-compose up --build -d
```

### Umgebungsvariablen

| Variable            | Beschreibung                  | Erforderlich | Standard              |
| ------------------- | ----------------------------- | ------------ | --------------------- |
| `DISCORD_TOKEN`     | Discord Bot Token             | Ja           | -                     |
| `DISCORD_CLIENT_ID` | Discord Application Client ID | Ja           | -                     |
| `DATABASE_URL`      | SQLite Datenbankpfad          | Nein         | `./data.db`           |
| `NODE_ENV`          | Umgebungsmodus                | Nein         | `production`          |
| `LOG_LEVEL`         | Logging Level                 | Nein         | `INFO`                |
| `CONTAINER_NAME`    | Docker Container Name         | Nein         | `aidi-reputation-bot` |

## Befehle

Der Bot unterstützt folgende Slash-Commands:

- `/reputation [user]` - Benutzer-Reputation anzeigen
- `/leaderboard [limit]` - Reputation-Rangliste anzeigen
- `/set-introduction-channel` - Einführungsforum konfigurieren (Admin)
- `/manage-ranks` - Reputation-Ränge verwalten (Admin)

## Architektur

Das Projekt folgt **Clean Architecture Prinzipien**:

### Layer-Struktur
- **Discord Layer** (`src/bot/`) - Discord.js Integration, Commands, Events, UI
- **Core Layer** (`src/core/`) - Geschäftslogik, Use Cases, Domain Services
- **Database Layer** (`src/db/`) - SQLite Datenpersistierung, Schema-Management

### Projektstruktur

```
src/
├── bot/           # Discord Bot Implementation
│   ├── commands/  # Slash Commands
│   ├── events/    # Discord Events
│   └── services/  # Discord-spezifische Services
├── core/          # Geschäftslogik
│   ├── usecases/  # Geschäftslogik-Orchestrierung
│   └── services/  # Domain Services
├── db/            # Datenbank Layer
└── index.ts       # Anwendungs-Einstiegspunkt
```

## Testing

Das Projekt verwendet **DHH-Style Testing (80/15/5)**:

```bash
# Alle Tests ausführen
pnpm test

# Tests mit UI
pnpm test:ui

# Spezifische Test-Datei
pnpm test tests/feature/specificTest.test.ts

# Watch-Modus
pnpm test --watch
```

## Code Quality

```bash
# Linting
pnpm lint
pnpm lint:fix

# Formatierung
pnpm format
pnpm format:check
```

## Contributing

Wir freuen uns über Beiträge! Hier ist, wie du mitmachen kannst:

### Entwicklungsrichtlinien

1. **Test-First Development:**
   - Schreibe zuerst einen fehlschlagenden Feature-Test
   - Implementiere minimalen Code zum Bestehen
   - Refaktoriere bei grünen Tests
   - Füge Edge-Case Tests hinzu

2. **Live-Safe Database Changes:**
   ⚠️ **KRITISCH**: Dieser Bot läuft LIVE. Datenbank-Migrationen müssen 100% rückwärtskompatibel sein.

   **Erlaubte Operationen:**
   - `CREATE TABLE IF NOT EXISTS` - Neue Tabellen hinzufügen
   - `ALTER TABLE ADD COLUMN` - Neue Spalten mit DEFAULT-Werten
   - `CREATE INDEX IF NOT EXISTS` - Performance-Indizes hinzufügen

   **VERBOTENE Operationen:**
   - `DROP TABLE` - Niemals Tabellen löschen
   - `DROP COLUMN` - Niemals Spalten löschen
   - `ALTER COLUMN` - Niemals Spaltentypen ändern

3. **Code-Stil:**
   - TypeScript strict mode - Keine `any` Types
   - oxlint für Performance-fokussiertes Linting
   - Prettier mit 4-Leerzeichen Tabs, doppelte Anführungszeichen
   - Module-Aliase - Verwende `@/` für src/ Imports

### Contribution Workflow

1. **Fork das Repository**

2. **Erstelle einen Feature Branch:**
   ```bash
   git checkout -b feature/awesome-feature
   ```

3. **Entwickle dein Feature:**
   ```bash
   # Starte mit Tests
   pnpm test tests/feature/yourFeature.test.ts
   
   # Entwickle in watch mode
   pnpm dev
   ```

4. **Teste und linte:**
   ```bash
   pnpm test:run
   pnpm lint
   pnpm format
   ```

5. **Commit mit aussagekräftiger Nachricht:**
   ```bash
   git commit -m "feat: add awesome feature for user engagement"
   ```

6. **Push und erstelle Pull Request:**
   ```bash
   git push origin feature/awesome-feature
   ```

### Pull Request Guidelines

- **Beschreibung:** Erkläre was, warum und wie
- **Tests:** Alle neuen Features müssen getestet sein
- **Dokumentation:** Aktualisiere README/CLAUDE.md bei API-Änderungen
- **Breaking Changes:** Dokumentiere rückwärts-inkompatible Änderungen

### Bug Reports

Verwende die [GitHub Issues](https://github.com/yourusername/aidi-reputation-bot/issues) mit:

- **Beschreibung:** Was passiert vs. was erwartet wird
- **Schritte zur Reproduktion:** Detaillierte Schritte
- **Umgebung:** OS, Node.js Version, Docker Version
- **Logs:** Relevante Log-Ausgaben

### Feature Requests

Diskutiere neue Features erst in Issues bevor du Code schreibst:

- **Use Case:** Warum ist das Feature nützlich?
- **Implementierung:** Grober Implementierungsplan
- **Breaking Changes:** Potentielle Auswirkungen

## Monitoring

```bash
# Container Stats
docker stats aidi-reputation-bot

# Resource Usage
docker-compose exec bot top

# Database Size
docker-compose exec bot du -sh /app/data/
```

## Troubleshooting

### Häufige Probleme

1. **Bot antwortet nicht:**
   ```bash
   docker-compose logs bot
   ```

2. **Datenbank-Probleme:**
   ```bash
   docker-compose exec bot ls -la /app/data/
   ```

3. **Permission-Fehler:**
   ```bash
   docker-compose down
   docker volume rm aidi-reputation-bot_bot_data
   docker-compose up --build
   ```

## Sicherheitsfeatures

- **Non-root Container User** (uid: 1000)
- **Read-only Filesystem** mit beschreibbarem Daten-Volume
- **Resource Limits** (512MB RAM, 1 CPU)
- **Security Profiles** (no-new-privileges)
- **Signal Handling** mit dumb-init

## Performance Tuning

Resource Limits in `docker-compose.yml` anpassen:

```yaml
deploy:
  resources:
    limits:
      memory: 1G # Für große Server erhöhen
      cpus: "2.0" # Für hohe Aktivität erhöhen
```

---

**Entwickelt mit ❤️ für die Discord Community**