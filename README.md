# Discord Reputation Bot

A Discord bot for managing user reputation and ranks in Discord servers.

## Features

- Reputation system with emoji reactions
- User leaderboards
- Rank management with role assignments
- Introduction channel configuration
- Daily bonus system
- Rate limiting for reputation awards

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Discord Bot Token and Client ID

### Setup

1. **Clone and configure:**
   ```bash
   git clone <repository>
   cd aidi-reputation-bot
   cp .env.example .env
   ```

2. **Edit `.env` file:**
   ```bash
   DISCORD_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_discord_client_id_here
   ```

3. **Start the bot:**
   ```bash
   docker-compose up --build -d
   ```

4. **Check logs:**
   ```bash
   docker-compose logs -f bot
   ```

### Local Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

## Docker Deployment

### Production Deployment

```bash
# Build and start
docker-compose up --build -d

# View logs
docker-compose logs -f bot

# Stop
docker-compose down

# Update and restart
docker-compose pull && docker-compose up --build -d
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DISCORD_TOKEN` | Discord bot token | Yes | - |
| `DISCORD_CLIENT_ID` | Discord application client ID | Yes | - |
| `DATABASE_URL` | SQLite database path | No | `./data.db` |
| `NODE_ENV` | Environment mode | No | `production` |
| `CONTAINER_NAME` | Docker container name | No | `aidi-reputation-bot` |

### Security Features

- **Non-root container user** (uid: 1000)
- **Read-only filesystem** with writable data volume
- **Resource limits** (512MB RAM, 1 CPU)
- **Security profiles** (no-new-privileges)
- **Signal handling** with dumb-init

## Commands

The bot supports the following slash commands:

- `/reputation [user]` - Show user reputation
- `/leaderboard [limit]` - Show reputation leaderboard
- `/set-introduction-channel` - Configure introduction forum (Admin)
- `/manage-ranks` - Manage reputation ranks (Admin)

## Architecture

- **SQLite Database** - Persistent data storage
- **Docker Container** - Isolated deployment
- **Multi-stage Build** - Optimized image size
- **Named Volumes** - Data persistence

## Monitoring

```bash
# Container stats
docker stats aidi-reputation-bot

# Resource usage
docker-compose exec bot top

# Database size
docker-compose exec bot du -sh /app/data/
```

## Troubleshooting

### Common Issues

1. **Bot not responding:**
   ```bash
   docker-compose logs bot
   ```

2. **Database issues:**
   ```bash
   docker-compose exec bot ls -la /app/data/
   ```

3. **Permission errors:**
   ```bash
   docker-compose down
   docker volume rm aidi-reputation-bot_bot_data
   docker-compose up --build
   ```

### Performance Tuning

Adjust resource limits in `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 1G        # Increase for large servers
      cpus: '2.0'       # Increase for high activity
```

## Development

### Project Structure

```
src/
├── bot/           # Discord bot implementation
├── core/          # Business logic
├── db/            # Database layer
└── index.ts       # Application entry point
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test reputation

# Watch mode
pnpm test --watch
```

## License

ISC