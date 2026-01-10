#!/bin/bash
# TimeFlip Connector Stop Script

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

echo "Stopping TimeFlip Connector..."

cd "$APP_DIR"
pm2 stop timeflip-connector 2>/dev/null || true
pm2 delete timeflip-connector 2>/dev/null || true

echo "TimeFlip Connector stopped"
