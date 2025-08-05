#!/bin/bash

# Docker logs fetcher for aidi-reputation-bot
# Usage: ./fetch-logs.sh <domain>
# Example: ./fetch-logs.sh example.com

DOMAIN="$1"

# Check if domain is provided
if [ -z "$DOMAIN" ]; then
    echo "Usage: ./fetch-logs.sh <domain>"
    echo "Example: ./fetch-logs.sh example.com"
    exit 1
fi

# Generate timestamp for log filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="docker-logs-${DOMAIN}-${TIMESTAMP}.log"

echo "Fetching Docker logs from root@${DOMAIN}..."
echo "Saving to: ${LOG_FILE}"

# Connect to server and fetch Docker logs
ssh root@${DOMAIN} "docker logs aidi-reputation-bot --tail=1000" > "${LOG_FILE}" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Docker logs successfully saved to ${LOG_FILE}"
    echo "📄 Log file size: $(wc -l < "${LOG_FILE}") lines"
else
    echo "❌ Failed to fetch Docker logs from root@${DOMAIN}"
    echo "Check SSH connection and Docker container status"
    exit 1
fi