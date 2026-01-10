#!/bin/bash
# TimeFlip Connector Startup Script
# This script initializes Bluetooth and starts the PM2 process

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$APP_DIR/logs"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

echo "$(date): Starting TimeFlip Connector..." >> "$LOG_DIR/startup.log"

# Stop bluetoothd to allow noble direct access
echo "$(date): Stopping bluetooth service..." >> "$LOG_DIR/startup.log"
systemctl stop bluetooth 2>/dev/null || true

# Wait a moment for service to stop
sleep 2

# Bring up the HCI device
echo "$(date): Bringing up hci0..." >> "$LOG_DIR/startup.log"
hciconfig hci0 up 2>/dev/null || {
    echo "$(date): Warning: Could not bring up hci0, retrying..." >> "$LOG_DIR/startup.log"
    sleep 3
    hciconfig hci0 up
}

# Wait for device to be ready
sleep 2

echo "$(date): Bluetooth ready, starting PM2 app..." >> "$LOG_DIR/startup.log"

# Start the PM2 app
cd "$APP_DIR"
pm2 start ecosystem.config.cjs

echo "$(date): TimeFlip Connector started successfully" >> "$LOG_DIR/startup.log"
