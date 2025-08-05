#!/bin/bash

# Deployment script for aidi-reputation-bot
# Usage: ./deploy.sh [--dry-run] <server>

DRY_RUN=""
SERVER=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        *)
            SERVER="$1"
            shift
            ;;
    esac
done

# Set default server if none provided
if [ -z "$SERVER" ]; then
    SERVER="azubi.community"
    echo "No server specified, using default: $SERVER"
fi

# Source and destination paths
SOURCE_DIR="$(pwd)/"
DEST_DIR="root@$SERVER:/root/aidi-reputation-bot/"

echo "Deploying to: $DEST_DIR"
if [ -n "$DRY_RUN" ]; then
    echo "DRY RUN MODE - No files will be transferred"
fi

# Run rsync with exclusions
rsync -avz $DRY_RUN \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '*.log' \
    --exclude '.env' \
    --exclude 'deploy.sh' \
    "$SOURCE_DIR" "$DEST_DIR"

echo "Deployment complete!"

# Build and restart Docker containers on the server (skip if dry run)
if [ -z "$DRY_RUN" ]; then
    echo "Building and restarting Docker containers..."
    ssh root@$SERVER "cd /root/aidi-reputation-bot && docker compose build && docker compose up -d"
    echo "Docker containers restarted!"
else
    echo "DRY RUN: Would execute: ssh root@$SERVER \"cd /root/aidi-reputation-bot && docker compose build && docker compose up -d\""
fi
