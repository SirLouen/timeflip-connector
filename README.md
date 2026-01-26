# TimeFlip Connector

A Node.js service that connects your [TimeFlip](https://timeflip.io/) device to [TimeTagger](https://timetagger.app/) for automatic time tracking. When you flip your TimeFlip device to a new facet, it automatically starts tracking time in TimeTagger with the corresponding activity.

## Features

- 🎲 **Automatic time tracking** - Flip your TimeFlip device and time tracking starts automatically
- ⏱️ **Settle delay** - Configurable delay to prevent accidental flips from triggering
- 🛑 **Stop facet** - Designate one facet to stop the current timer
- 🔄 **Auto-reconnect** - Automatically reconnects if the Bluetooth connection is lost
- 🚀 **Background service** - Runs as a systemd service with PM2 process management
- 📊 **TimeTagger integration** - Seamlessly integrates with your self-hosted TimeTagger instance
- 🌐 **Web interface** - Simple web UI to view device status and manage facet configuration

## Requirements

- Node.js >= 16.0.0
- Linux with Bluetooth 4.0+ adapter (tested on Raspberry Pi)
- [TimeTagger](https://timetagger.app/) instance (self-hosted or cloud)
- TimeFlip v2, v3, or v4 device

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/SirLouen/timeflip-connector.git
cd timeflip-connector
```

### 2. Install dependencies

```bash
pnpm install
# or
npm install
```

### 3. Find your TimeFlip device

```bash
# Stop the system Bluetooth service first (required for noble)
sudo systemctl stop bluetooth

# Bring up the Bluetooth adapter
sudo hciconfig hci0 up

# Discover TimeFlip devices
pnpm run discover
```

Note down your device's MAC address (e.g., `00:11:22:33:44:55`).

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```dotenv
# TimeFlip Device Configuration
TIMEFLIP_ADDRESS=00:11:22:33:44:55
TIMEFLIP_PASSWORD=000000

# TimeTagger API Configuration
TIMETAGGER_URL=https://your-timetagger-instance.com/timetagger/api/v2
TIMETAGGER_TOKEN=your_api_token_here

# Web Interface (optional)
WEB_PORT=3000
```

To get your TimeTagger API token, go to your TimeTagger instance → Account → API token.

### 5. Configure facets

```bash
cp config/facets.example.json config/facets.json
```

Edit `config/facets.json` to map each facet number to an activity:

```json
{
  "facets": {
    "1": "coding",
    "2": "meeting",
    "3": "reading",
    "4": "exercise",
    "5": "break",
    "6": "email",
    "7": "planning",
    "8": "learning",
    "9": "admin",
    "10": "creative",
    "11": "communication",
    "12": "stop"
  },
  "stopFacet": 12,
  "settleDelayMs": 5000
}
```

- **facets**: Maps facet numbers (1-12) to TimeTagger activity tags
- **stopFacet**: Which facet number stops the current timer (set to `null` to disable)
- **settleDelayMs**: Delay in milliseconds before registering a flip (prevents accidental triggers)

## Web Interface

The connector includes a simple web interface that allows you to:

- **View device status**: See if the TimeFlip is connected and what facet is currently active
- **Monitor active timer**: Check which timer is currently running
- **Edit facet configuration**: Modify facet names and the stop facet directly from the browser
- **Save changes**: Update the configuration file without editing JSON manually

By default, the web interface runs on port 3000. Access it at `http://localhost:3000` (or your server's IP address).

You can change the port by setting the `WEB_PORT` environment variable:

```bash
WEB_PORT=8080
```

## Usage

### Run manually

```bash
# Make sure Bluetooth service is stopped
sudo systemctl stop bluetooth
sudo hciconfig hci0 up

# Start the connector
node index.js
```

### Run as a background service

#### Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Copy and edit the PM2 config
cp ecosystem.config.example.cjs ecosystem.config.cjs
# Edit ecosystem.config.cjs with your paths

# Start the service
pm2 start ecosystem.config.cjs

# View logs
pm2 logs timeflip-connector
```

#### Using systemd (for auto-start on boot)

```bash
# Copy and edit the service file
cp scripts/timeflip-connector.example.service scripts/timeflip-connector.service
# Edit the paths in timeflip-connector.service

# Install the service
sudo cp scripts/timeflip-connector.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable timeflip-connector
sudo systemctl start timeflip-connector

# Check status
sudo systemctl status timeflip-connector
```

### Helper scripts

```bash
# Start the service (stops bluetooth, brings up adapter, starts PM2)
./scripts/start.sh

# Stop the service
./scripts/stop.sh
```

## Project Structure

```
timeflip-connector/
├── index.js                 # Main application
├── package.json
├── pnpm-workspace.yaml      # Monorepo configuration
├── .env                     # Environment variables (not tracked)
├── config/
│   └── facets.json          # Facet configuration (not tracked)
├── src/
│   └── timeTaggerApi.js     # TimeTagger API client
├── scripts/
│   ├── start.sh             # Start script
│   ├── stop.sh              # Stop script
│   └── timeflip-connector.example.service
├── logs/                    # PM2 log files
└── packages/
    └── jstimefliplib/       # TimeFlip Bluetooth library
```

## Packages

This is a monorepo containing:

- **timeflip-connector** (root) - The main application
- **[jstimefliplib](packages/jstimefliplib/)** - JavaScript library for TimeFlip device communication via Bluetooth LE

## Troubleshooting

### "Bluetooth adapter not available"

Make sure the system Bluetooth service is stopped and the adapter is up:

```bash
sudo systemctl stop bluetooth
sudo hciconfig hci0 up
```

### "Device not found"

- Ensure your TimeFlip is charged and awake (flip it)
- Check that the MAC address in `.env` is correct
- Try running the discover script: `pnpm run discover`

### "Bluetooth permission denied" when running as non-root

Noble requires root privileges or proper capabilities. Either:
- Run with `sudo`
- Or set capabilities: `sudo setcap cap_net_raw+eip $(eval readlink -f $(which node))`

### Native module errors after Node.js upgrade

Rebuild native modules:

```bash
pnpm rebuild
# or for the specific package:
cd node_modules/.pnpm/@abandonware+bluetooth-hci-socket@*/node_modules/@abandonware/bluetooth-hci-socket
npm rebuild
```

## License

MIT

## Credits

- [TimeFlip](https://timeflip.io/) - The amazing time tracking device
- [TimeTagger](https://timetagger.app/) - Open source time tracking app
- [pytimefliplib](https://github.com/pierre-24/pytimefliplib) - Original Python implementation
- [@abandonware/noble](https://github.com/abandonware/noble) - Bluetooth Low Energy library
