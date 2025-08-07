# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Testing
- `pnpm test` - Run all tests in watch mode
- `pnpm test:run` - Run all tests once
- `pnpm test:ui` - Run tests with Vitest UI
- `pnpm test tests/feature/specificTest.test.ts` - Run specific test file

### Building & Running
- `pnpm dev` - Start development server with hot reload (uses tsx)
- `pnpm build` - Build for production (TypeScript compilation)
- `pnpm start` - Run production build
- `pnpm start:prod` - Run production build with NODE_ENV=production

### Code Quality
- `pnpm lint` - Check code with oxlint
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm format` - Format all code with Prettier
- `pnpm format:check` - Check formatting without changes
- `pnpm format:staged` - Format only staged files

### Environment Variables
- `LOG_LEVEL` - Set logging level (DEBUG, INFO, WARN, ERROR). Default: INFO

## Architecture Overview

This is a Discord reputation bot built with **Clean Architecture principles**:

### Layer Structure
- **Discord Layer** (`src/bot/`) - Discord.js integration, commands, events, UI (embeds)
- **Core Layer** (`src/core/`) - Business logic, use cases, domain services (platform-agnostic)
- **Database Layer** (`src/db/`) - SQLite data persistence, schema management

### Key Components

#### Use Cases (`src/core/usecases/`)
Business logic orchestration:
- `addReputationForReaction` - Main reputation award logic with validation and rate limiting
- `removeReputationForReaction` - Remove reputation when reactions are removed
- `awardDailyBonus` - Daily bonus system
- `awardIntroductionBonus` - Introduction channel bonus system
- `configureIntroductionChannel` - Setup introduction forum
- `configureNotificationChannel` - Setup notification channel

#### Services (`src/core/services/`)
Domain services for specific functionality:
- `reputationService` - Core reputation tracking and queries
- `rateLimitService` - Rate limiting logic and enforcement
- `roleManagementService` - Discord role assignment based on reputation
- `inviteTrackingService` - User invitation tracking and rewards
- `notificationService` - Notification message generation

#### Configuration (`src/config/reputation.ts`)
Immutable configuration in code:
- `REPUTATION_EMOJIS` - Supported emojis and point values (🏆 = 1 point)
- `RATE_LIMIT_CONFIG` - Daily limits, per-recipient limits, time windows
- `DAILY_BONUS_CONFIG` - Daily bonus system configuration
- `INTRODUCTION_CONFIG` - Introduction channel bonus settings

### Database Schema
Event-sourced design with SQLite:
- `reputation_events` - Primary event log (single source of truth)
- `reputation_rate_limits` - Rate limiting tracking
- `daily_bonus_tracking` - Daily bonus awards
- `introduction_channel_config` - Introduction forum settings
- `reputation_ranks` - Reputation-based role assignments
- `user_invites` & `invite_joins` - User invitation system

### Key Features
- **Reputation System**: Award points via 🏆 emoji reactions
- **Rate Limiting**: Prevents abuse (5 awards/day, 1 per recipient per day)
- **Role Management**: Automatic role assignment based on reputation levels with hierarchy validation
- **Daily Bonus**: Daily reputation bonus system
- **Introduction System**: Bonus points for forum introductions and replies
- **Leaderboards**: Guild-specific reputation rankings
- **Invite Tracking**: Track and reward user invitations
- **Enhanced Logging**: Structured logging with configurable levels (DEBUG, INFO, WARN, ERROR)
- **Role Validation**: `/manage-ranks validate` command to check bot permissions and role configuration

## Testing Strategy

### DHH-Style Testing (80/15/5)
- **80% Feature Tests** - End-to-end user journeys in `tests/feature/`
- **15% Integration Tests** - Service combinations
- **5% Unit Tests** - Critical isolated logic

### Test Setup
- Uses **real SQLite in-memory database** (not mocked)
- **Minimal mocking** - Only Discord API and configuration
- Tests in `tests/feature/` follow user behavior patterns
- Test utilities in `tests/setup/testUtils.ts`

### Test-First Development
1. Write failing feature test first
2. Implement minimal code to pass
3. Refactor while keeping tests green
4. Add edge case tests

## Development Guidelines

### Live-Safe Database Changes
⚠️ **CRITICAL**: This bot runs LIVE. Database migrations must be 100% backward-compatible.

**Allowed Operations:**
- `CREATE TABLE IF NOT EXISTS` - Add new tables
- `ALTER TABLE ADD COLUMN` - Add new columns with DEFAULT values
- `CREATE INDEX IF NOT EXISTS` - Add performance indexes

**FORBIDDEN Operations:**
- `DROP TABLE` - Never delete tables
- `DROP COLUMN` - Never delete columns
- `ALTER COLUMN` - Never change column types
- Breaking constraint changes

### Error Handling Patterns
- Use `ReputationValidationError` enum for business logic errors
- Return `ReputationAwardResult` objects with `success: boolean` pattern
- Graceful degradation - log errors, continue operation
- No throwing exceptions in business logic layer

### Code Quality Standards
- **TypeScript strict mode** - No `any` types
- **oxlint** for performance-focused linting
- **Prettier** with 4-space tabs, double quotes
- **Module aliases** - Use `@/` for src/ imports
- Follow existing naming conventions (camelCase functions, PascalCase types)

### Business Rules
- **Self-award prevention** - Users cannot award themselves reputation
- **Bot protection** - Bots cannot receive reputation
- **Rate limiting** - 5 awards per user per day, 1 per recipient per day
- **Emoji validation** - Only configured emojis award points
- **Guild isolation** - All data is guild-specific

### Module Alias Setup
- Development: `@/` maps to `src/`
- Production: Uses module-alias/register
- Configured in `package.json` and `vitest.config.ts`

## Common Operations

### Adding New Features
1. Write feature tests first in `tests/feature/`
2. Add database schema changes (additive only) to `src/db/schema.ts`
3. Implement core business logic in `src/core/`
4. Add Discord integration in `src/bot/` if needed
5. Run full test suite and linting before committing

### Debugging
- Check `docker-compose logs -f bot` for container logs
- Use `pnpm test:ui` for interactive test debugging
- Database file located at `./data.db` (production) or `:memory:` (tests)

### Performance Considerations
- Database operations use prepared statements
- Rate limit cleanup runs every 6 hours
- Uses SQLite transactions for multi-step operations
- In-memory database for tests ensures fast test execution