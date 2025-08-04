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

# Check if server is provided
if [ -z "$SERVER" ]; then
    echo "Usage: ./deploy.sh [--dry-run] <server>"
    echo "Example: ./deploy.sh --dry-run root@example.com"
    exit 1
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
