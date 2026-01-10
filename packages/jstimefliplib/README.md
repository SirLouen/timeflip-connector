# `jstimefliplib`

A JavaScript library for TimeFlip devices v3 and v4.

This is a port of [pytimefliplib](https://github.com/pierre-24/pytimefliplib) from Python to JavaScript/Node.js.

The communication protocol (empirically corrected) for the V3 version is described [here](https://github.com/DI-GROUP/TimeFlip.Docs/blob/master/Hardware/BLE_device_commutication_protocol_v3.0_en.md).

The one concerning V4 is given [here](https://github.com/DI-GROUP/TimeFlip.Docs/blob/master/Hardware/TimeFlip%20BLE%20protocol%20ver4_02.06.2020.md).

## Install

```bash
npm install jstimefliplib
```

Or install from source:

```bash
git clone https://github.com/your-username/jstimefliplib.git
cd jstimefliplib
npm install
```

### Prerequisites

This library uses [@abandonware/noble](https://github.com/abandonware/noble) for Bluetooth Low Energy support. Please ensure you have the necessary prerequisites installed for your platform:

- **Windows**: Requires Windows 10 build 10.0.15063 or later with Bluetooth 4.0 adapter
- **macOS**: Requires macOS 10.7 or later with Bluetooth 4.0 adapter
- **Linux**: Requires BlueZ 5.x with `libbluetooth-dev` installed

## Usage

### As a Library

```javascript
import { AsyncClient, DEFAULT_PASSWORD } from 'jstimefliplib';

async function main() {
  const client = new AsyncClient('00:11:22:33:44:55');
  
  try {
    await client.connect();
    console.log('Connected!');
    
    await client.setup(null, DEFAULT_PASSWORD);
    console.log('Logged in!');
    
    // Get device info
    console.log('Name:', await client.deviceName());
    console.log('Battery:', await client.batteryLevel());
    console.log('Firmware:', await client.firmwareRevision());
    console.log('Current facet:', await client.currentFacet());
    
    // Get status
    const status = await client.getStatus();
    console.log('Status:', status);
    
    // Get history
    const history = await client.history();
    console.log('History entries:', history.length);
    
  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);
```

### With Facet Change Callback

```javascript
import { AsyncClient } from 'jstimefliplib';

async function main() {
  const client = new AsyncClient('00:11:22:33:44:55');
  
  await client.connect();
  
  // Setup with callback for facet changes
  await client.setup((facet) => {
    console.log('Facet changed to:', facet);
  }, '000000');
  
  // Keep running to receive notifications
  console.log('Listening for facet changes... Press Ctrl+C to exit');
  
  process.on('SIGINT', async () => {
    await client.disconnect();
    process.exit();
  });
}

main().catch(console.error);
```

### CLI Scripts

The package provides convenient CLI scripts:

#### Discover TimeFlip devices

```bash
npm run discover
# or
npx timeflip-discover
```

Output:
```
Looking around (this can take up to 1 minute) ... Done!
Results::
- TimeFlip devices: 0C:61:CF:C7:77:71 (TimeFlip)
- Other BLE devices: (redacted)
- Other devices: (redacted)
```

#### Get device status

```bash
npm run check -- -a 0C:61:CF:C7:77:71 -p 123456
# or
npx timeflip-check -a 0C:61:CF:C7:77:71 -p 123456
```

Output:
```
! Connected to 0C:61:CF:C7:77:71
! Password communicated
TimeFlip characteristics::
- Name: MyFlip
- Firmware: TFv3.1
- Battery: 83
- Current facet: 9
- Accelerometer vector: 0.832, -0.438, 0.262
- Status: { locked: false, paused: false, autoPauseTime: 0 }
History::
- Facet=0, during 2 seconds
- Facet=1, during 712 seconds
(...)
```

#### Change device password

```bash
npm run set-password -- -a 0C:61:CF:C7:77:71 123456
# or
npx timeflip-set-passwd -a 0C:61:CF:C7:77:71 123456
```

Don't forget to use `-p` for further interactions!

#### Change device name

```bash
npm run set-name -- -a 0C:61:CF:C7:77:71 -p 123456 MyFlip
# or
npx timeflip-set-name -a 0C:61:CF:C7:77:71 -p 123456 MyFlip
```

#### Clear history

```bash
npm run clear-history -- -a 0C:61:CF:C7:77:71 -p 123456
# or
npx timeflip-clear-history -a 0C:61:CF:C7:77:71 -p 123456
```

## API Reference

### AsyncClient

#### Constructor

```javascript
new AsyncClient(address, disconnectedCallback = null)
```

- `address`: MAC address or UUID of the TimeFlip device
- `disconnectedCallback`: Optional callback when device disconnects

#### Methods

##### Connection

- `connect()`: Connect to the device
- `disconnect()`: Disconnect from the device
- `setup(facetCallback, password)`: Initialize the client with optional facet change callback

##### Device Information

- `batteryLevel()`: Get battery percentage (0-100)
- `firmwareRevision()`: Get firmware version string
- `deviceName()`: Get device name
- `currentFacet(force)`: Get current facet (0-47)

##### Status (v3 and v4)

- `getStatus()`: Get lock, pause, and auto-pause status
- `setPaused(state, force)`: Set pause state
- `setLock(state, force)`: Set lock state
- `setAutoPause(time)`: Set auto-pause time in minutes

##### Device Settings (v3 and v4)

- `setName(name)`: Set device name
- `setPassword(password)`: Set device password (6 characters)

##### History (v3)

- `history()`: Get history entries
- `historyDelete()`: Clear history

##### v3 Only

- `accelerometerValue(multiplier)`: Get accelerometer vector
- `getCalibrationVersion()`: Get calibration version
- `setCalibrationVersion(version)`: Set calibration version

##### v4 Only

- `getTime()`: Get internal clock time
- `setTime(time)`: Set internal clock time
- `setBrightness(brightness)`: Set LED brightness (0-100)
- `setBlinkFrequency(frequency)`: Set blink frequency (5-60 seconds)
- `setColor(facet, rgb)`: Set facet color
- `setFacet(facet, mode, pomodoro)`: Set facet mode
- `getFacet(facet)`: Get facet settings
- `getAllFacets()`: Get all facet settings
- `getEvent()`: Get event data
- `getHistory(eventNum)`: Get specific history entry
- `getAllHistory()`: Get all history entries

### Error Classes

- `TimeFlipRuntimeError`: Base error class
- `NotConnectedError`: Not connected to device
- `NotLoggedInError`: Not logged in
- `IncorrectPasswordError`: Wrong password
- `TimeFlipCommandError`: Command execution failed
- `UnimplementedFunctionError`: Function not available in this firmware
- `DeprecatedFunctionError`: Function deprecated in this firmware

## License

MIT

## Credits

This is a JavaScript port of [pytimefliplib](https://github.com/pierre-24/pytimefliplib) by Pierre Beaujean.
