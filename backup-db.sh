#!/bin/bash

# Database backup script for aidi-reputation-bot
# Usage: ./backup-db.sh [--dry-run] [--compress] <server>

DRY_RUN=""
COMPRESS=""
SERVER=""

# Function to slugify strings for safe filenames
slugify() {
    echo "$1" | sed 's/[^a-zA-Z0-9-]/_/g' | sed 's/__*/_/g' | sed 's/^_\|_$//g'
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        --compress)
            COMPRESS="true"
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
    echo "Usage: ./backup-db.sh [--dry-run] [--compress] <server>"
    echo "Example: ./backup-db.sh --dry-run root@example.com"
    echo "Example: ./backup-db.sh --compress root@production-server.com"
    exit 1
fi

# Generate timestamp and create backup directory structure
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
DATE_DIR=$(date '+%Y-%m-%d')
BACKUP_BASE_DIR="backups"
BACKUP_DATE_DIR="$BACKUP_BASE_DIR/$DATE_DIR"
SLUGIFIED_SERVER=$(slugify "$SERVER")

# Create backup directories
if [ -z "$DRY_RUN" ]; then
    mkdir -p "$BACKUP_DATE_DIR"
fi

# Define paths
REMOTE_DB_PATH="/var/lib/docker/volumes/aidi-reputation-bot_bot_data/_data/data.db"
BACKUP_FILENAME="aidi-reputation-bot_${TIMESTAMP}_${SLUGIFIED_SERVER}.db"
LOCAL_DB_PATH="$BACKUP_DATE_DIR/$BACKUP_FILENAME"

echo "Database backup configuration:"
echo "  Server: $SERVER"
echo "  Remote DB: $REMOTE_DB_PATH"
echo "  Local backup: $LOCAL_DB_PATH"
if [ -n "$COMPRESS" ]; then
    echo "  Compression: enabled (.gz)"
fi
if [ -n "$DRY_RUN" ]; then
    echo "  DRY RUN MODE - No files will be transferred"
fi
echo ""

# Check if remote database exists
echo "Checking if remote database exists..."
if [ -z "$DRY_RUN" ]; then
    if ! ssh "$SERVER" "test -f $REMOTE_DB_PATH"; then
        echo "ERROR: Remote database $REMOTE_DB_PATH does not exist on $SERVER"
        exit 1
    fi
    echo "✓ Remote database found"
else
    echo "DRY RUN: Would check if $REMOTE_DB_PATH exists on $SERVER"
fi

# Copy database from remote server
echo "Copying database from remote server..."
if [ -z "$DRY_RUN" ]; then
    if scp "$SERVER:$REMOTE_DB_PATH" "$LOCAL_DB_PATH"; then
        echo "✓ Database backup completed successfully"
        
        # Get file size for logging
        DB_SIZE=$(du -h "$LOCAL_DB_PATH" | cut -f1)
        echo "  Backup size: $DB_SIZE"
        
        # Compress if requested
        if [ -n "$COMPRESS" ]; then
            echo "Compressing backup..."
            if gzip "$LOCAL_DB_PATH"; then
                COMPRESSED_SIZE=$(du -h "${LOCAL_DB_PATH}.gz" | cut -f1)
                echo "✓ Backup compressed successfully"
                echo "  Compressed size: $COMPRESSED_SIZE"
                LOCAL_DB_PATH="${LOCAL_DB_PATH}.gz"
            else
                echo "ERROR: Failed to compress backup"
                exit 1
            fi
        fi
        
        # Log backup information
        echo ""
        echo "Backup completed successfully!"
        echo "  File: $LOCAL_DB_PATH"
        echo "  Timestamp: $TIMESTAMP"
        echo "  Server: $SERVER"
        
        # Add entry to backup log
        BACKUP_LOG="$BACKUP_BASE_DIR/backup.log"
        echo "$(date '+%Y-%m-%d %H:%M:%S') | $SERVER | $LOCAL_DB_PATH | $(du -h "$LOCAL_DB_PATH" | cut -f1)" >> "$BACKUP_LOG"
        
    else
        echo "ERROR: Failed to copy database from remote server"
        exit 1
    fi
else
    echo "DRY RUN: Would copy $SERVER:$REMOTE_DB_PATH to $LOCAL_DB_PATH"
    if [ -n "$COMPRESS" ]; then
        echo "DRY RUN: Would compress backup to ${LOCAL_DB_PATH}.gz"
    fi
fi

echo ""
echo "Database backup script completed!"