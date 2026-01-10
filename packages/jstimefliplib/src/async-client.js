/**
 * TimeFlip Asynchronous Client
 * JavaScript port of pytimefliplib's async_client.py
 */

import noble from '@abandonware/noble';
import {
  CHARACTERISTICS,
  CHARACTERISTIC_READ_LENGTHS,
  CHARACTERISTIC_WRITE_LENGTHS,
  DEFAULT_PASSWORD,
  COMMANDS,
  TIMEFLIP_ENDIANNESS,
  BLUETOOTH_ENDIANNESS
} from './constants.js';
import {
  NotConnectedError,
  NotLoggedInError,
  TimeFlipCommandError,
  DeprecatedFunctionError,
  UnimplementedFunctionError
} from './errors.js';

/**
 * Decorator function to ensure connection before executing method
 * @param {Function} fn 
 * @returns {Function}
 */
function requiresConnection(fn) {
  return async function(...args) {
    if (!this.connected) {
      throw new NotConnectedError();
    }
    return fn.apply(this, args);
  };
}

/**
 * Decorator function to ensure login before executing method
 * @param {Function} fn 
 * @returns {Function}
 */
function requiresLogin(fn) {
  return async function(...args) {
    if (!this.logged) {
      throw new NotLoggedInError();
    }
    return fn.apply(this, args);
  };
}

/**
 * Convert UUID to short format for noble
 * @param {string} uuid 
 * @returns {string}
 */
function normalizeUUID(uuid) {
  return uuid.toLowerCase().replace(/-/g, '');
}

/**
 * Read buffer as big-endian integer
 * @param {Buffer} buf 
 * @param {number} start 
 * @param {number} end 
 * @returns {number}
 */
function readBigEndianInt(buf, start = 0, end = buf.length) {
  let result = 0;
  for (let i = start; i < end; i++) {
    result = result * 256 + buf[i];
  }
  return result;
}

/**
 * Read buffer as little-endian integer
 * @param {Buffer} buf 
 * @param {number} start 
 * @param {number} end 
 * @returns {number}
 */
function readLittleEndianInt(buf, start = 0, end = buf.length) {
  let result = 0;
  for (let i = end - 1; i >= start; i--) {
    result = result * 256 + buf[i];
  }
  return result;
}

/**
 * Write big-endian integer to buffer
 * @param {number} value 
 * @param {number} length 
 * @returns {Buffer}
 */
function writeBigEndianInt(value, length) {
  const buf = Buffer.alloc(length);
  for (let i = length - 1; i >= 0; i--) {
    buf[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return buf;
}

/**
 * Write little-endian integer to buffer
 * @param {number} value 
 * @param {number} length 
 * @returns {Buffer}
 */
function writeLittleEndianInt(value, length) {
  const buf = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    buf[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return buf;
}

/**
 * TimeFlip asynchronous client
 */
export class AsyncClient {
  /**
   * Create a new AsyncClient
   * @param {string} address - MAC address or UUID of the device
   * @param {Function} disconnectedCallback - Callback when device disconnects
   */
  constructor(address, disconnectedCallback = null) {
    this.address = address.toLowerCase().replace(/:/g, '');
    this.disconnectedCallback = disconnectedCallback;
    this.peripheral = null;
    this.characteristics = {};

    // TimeFlip states
    this.logged = false;
    this.connected = false;
    this.facetCallback = null;

    this.facetNotifyActive = false;
    this.eventNotifyActive = false;
    this.historyNotifyActive = false;

    this.paused = false;
    this.locked = false;
    this.autoPauseTime = 0;
    this.currentFacetValue = -1;

    this.firmwareVersion = null;

    // Bind version-specific methods (default to v3 for backwards compatibility)
    this.getStatus = this._getStatusV3.bind(this);
    this.setPaused = this._setPausedV3.bind(this);
    this.setLock = this._setLockV3.bind(this);
    this.setAutoPause = this._setAutoPauseV3.bind(this);
    this.setName = this._setNameV3.bind(this);
    this.setPassword = this._setPasswordV3.bind(this);
    this.getCalibrationVersion = this._getCalibrationVersionV3.bind(this);
    this.setCalibrationVersion = this._setCalibrationVersionV3.bind(this);

    // Aliases for backwards compatibility
    this.lock = this.setLock;
    this.pause = this.setPaused;
    this.status = this.getStatus;
  }

  /**
   * Connect to the device
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        noble.stopScanning();
        reject(new Error('Connection timeout'));
      }, 30000);

      const onDiscover = async (peripheral) => {
        const peripheralId = peripheral.id || peripheral.address?.replace(/:/g, '').toLowerCase();
        
        if (peripheralId === this.address || peripheral.address?.toLowerCase().replace(/:/g, '') === this.address) {
          noble.stopScanning();
          clearTimeout(timeout);
          noble.removeListener('discover', onDiscover);

          this.peripheral = peripheral;

          peripheral.once('disconnect', () => {
            this.connected = false;
            this.logged = false;
            if (this.disconnectedCallback) {
              this.disconnectedCallback(this);
            }
          });

          try {
            await this._connectPeripheral();
            this.connected = true;
            resolve();
          } catch (err) {
            reject(err);
          }
        }
      };

      noble.on('discover', onDiscover);

      if (noble.state === 'poweredOn') {
        noble.startScanning([], false);
      } else {
        noble.once('stateChange', (state) => {
          if (state === 'poweredOn') {
            noble.startScanning([], false);
          } else {
            clearTimeout(timeout);
            reject(new Error(`Bluetooth state: ${state}`));
          }
        });
      }
    });
  }

  /**
   * Internal method to connect to peripheral and discover services
   * @private
   */
  async _connectPeripheral() {
    return new Promise((resolve, reject) => {
      this.peripheral.connect((err) => {
        if (err) {
          reject(err);
          return;
        }

        this.peripheral.discoverAllServicesAndCharacteristics((err, services, characteristics) => {
          if (err) {
            reject(err);
            return;
          }

          // Map characteristics by UUID
          for (const char of characteristics) {
            const uuid = normalizeUUID(char.uuid);
            for (const [name, charUuid] of Object.entries(CHARACTERISTICS)) {
              if (normalizeUUID(charUuid) === uuid) {
                this.characteristics[name] = char;
              }
            }
          }

          resolve();
        });
      });
    });
  }

  /**
   * Read characteristic value
   * @param {string} characteristic - Characteristic name
   * @returns {Promise<Buffer>}
   */
  async baseCharRead(characteristic) {
    if (!this.connected) {
      throw new NotConnectedError();
    }

    if (!(characteristic in CHARACTERISTICS)) {
      throw new Error('Invalid characteristic');
    }

    const length = CHARACTERISTIC_READ_LENGTHS[characteristic];
    if (length === -1) {
      throw new Error('Characteristic not supported for read');
    }

    const char = this.characteristics[characteristic];
    if (!char) {
      throw new Error(`Characteristic ${characteristic} not found on device`);
    }

    return new Promise((resolve, reject) => {
      char.read((err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.slice(0, length));
        }
      });
    });
  }

  /**
   * Write characteristic value
   * @param {string} characteristic - Characteristic name
   * @param {Buffer} data - Data to write
   * @returns {Promise<void>}
   */
  async baseCharWrite(characteristic, data) {
    if (!this.connected) {
      throw new NotConnectedError();
    }

    if (!(characteristic in CHARACTERISTICS)) {
      throw new Error('Invalid characteristic');
    }

    const length = CHARACTERISTIC_WRITE_LENGTHS[characteristic];
    if (length === -1) {
      throw new Error('Characteristic not supported for write');
    }

    const char = this.characteristics[characteristic];
    if (!char) {
      throw new Error(`Characteristic ${characteristic} not found on device`);
    }

    return new Promise((resolve, reject) => {
      char.write(data, false, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Disconnect from the device
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.connected) return;

    try {
      if (this.facetNotifyActive) {
        await this.unregisterNotifyFacetV3();
      }
      if (this.eventNotifyActive) {
        await this.unregisterNotifyEventV4();
      }
      if (this.historyNotifyActive) {
        await this.unregisterNotifyHistoryV4();
      }
    } catch (e) {
      // Ignore errors during cleanup
    }

    if (this.facetCallback && this.characteristics.facet) {
      try {
        await new Promise((resolve) => {
          this.characteristics.facet.unsubscribe((err) => resolve());
        });
      } catch (e) {
        // Ignore
      }
    }

    return new Promise((resolve) => {
      if (this.peripheral) {
        this.peripheral.disconnect(() => {
          this.connected = false;
          this.logged = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // ============ Client basic characteristics ============

  /**
   * Get the battery level
   * @returns {Promise<number>} Percentage of battery level (0-100)
   */
  async batteryLevel() {
    if (!this.connected) throw new NotConnectedError();
    // Handle case where battery_level characteristic doesn't exist
    if (!this.characteristics.battery_level) {
      return -1;  // Unknown battery level
    }
    const data = await this.baseCharRead('battery_level');
    return data[0];
  }

  /**
   * Get firmware revision version
   * @returns {Promise<string>}
   */
  async firmwareRevision() {
    if (!this.connected) throw new NotConnectedError();
    // Handle case where firmware_revision characteristic doesn't exist (e.g., TimeFlip v2.0)
    if (!this.characteristics.firmware_revision) {
      return 'TFv2.0';  // Default for older devices
    }
    const data = await this.baseCharRead('firmware_revision');
    return data.toString('ascii').replace(/\0/g, '');
  }

  /**
   * Get device name
   * @returns {Promise<string>}
   */
  async deviceName() {
    if (!this.connected) throw new NotConnectedError();
    // Handle case where device_name characteristic doesn't exist
    if (!this.characteristics.device_name) {
      return 'TimeFlip';  // Default name
    }
    const data = await this.baseCharRead('device_name');
    return data.toString('ascii').replace(/\0/g, '');
  }

  // ============ Client specific characteristics ============

  /**
   * Login with password
   * @param {string} password - Device password (default: '000000')
   * @returns {Promise<boolean>}
   */
  async login(password = DEFAULT_PASSWORD) {
    if (!this.connected) throw new NotConnectedError();
    await this.baseCharWrite('password_input', Buffer.from(password, 'ascii'));
    this.logged = true;
    return this.logged;
  }

  /**
   * Setup the client:
   * - Get firmware version
   * - Log in
   * - Set up notification callback on facet characteristic
   * - Get status to update internals
   * - Get current facet
   * @param {Function} facetCallback - Callback when facet changes
   * @param {string} password - Device password
   * @returns {Promise<void>}
   */
  async setup(facetCallback = null, password = DEFAULT_PASSWORD) {
    // Get firmware version
    const firmwareRevision = await this.firmwareRevision();
    // Parse firmware version - handle different formats like "TFv3.47" or "TFv2.0"
    const versionMatch = firmwareRevision.match(/(\d+\.\d+)/);
    this.firmwareVersion = versionMatch ? parseFloat(versionMatch[1]) : 2.0;

    if (this.firmwareVersion >= 3.47) {
      // Consistent functions between versions
      this.getStatus = this._getStatusV3.bind(this);
      this.setPaused = this._setPausedV3.bind(this);
      this.setLock = this._setLockV3.bind(this);
      this.setAutoPause = this._setAutoPauseV3.bind(this);
      this.setName = this._setNameV3.bind(this);
      this.setPassword = this._setPasswordV3.bind(this);

      // New or changed in version 4
      this.getTime = this._getTimeV4.bind(this);
      this.setTime = this._setTimeV4.bind(this);
      this.setBrightness = this._setBrightnessV4.bind(this);
      this.setBlinkFrequency = this._setBlinkFrequencyV4.bind(this);
      this.setColor = this._setColorV4.bind(this);
      this.setFacet = this._setFacetV4.bind(this);
      this.getFacet = this._getFacetV4.bind(this);
      this.getAllFacets = this._getAllFacetsV4.bind(this);
      this.getEvent = this._getEventV4.bind(this);
      this.getHistory = this._getHistoryV4.bind(this);
      this.getAllHistory = this._getAllHistoryV4.bind(this);

      // Deprecated in version 4
      this.getCalibrationVersion = this._deprecatedFunction.bind(this);
      this.setCalibrationVersion = this._deprecatedFunction.bind(this);
    } else {
      this.getStatus = this._getStatusV3.bind(this);
      this.getCalibrationVersion = this._getCalibrationVersionV3.bind(this);
      this.setCalibrationVersion = this._setCalibrationVersionV3.bind(this);
    }

    if (!await this.login(password)) {
      throw new NotLoggedInError();
    }

    // Set up facet notification
    if (facetCallback) {
      this.facetCallback = facetCallback;
    }

    const facetChar = this.characteristics.facet;
    if (facetChar) {
      await new Promise((resolve, reject) => {
        facetChar.subscribe((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      facetChar.on('data', (data) => {
        this.currentFacetValue = readBigEndianInt(data);
        if (this.facetCallback) {
          this.facetCallback(this.currentFacetValue);
        }
      });
    }

    // Get current status
    const currentStatus = await this.getStatus();
    this.paused = currentStatus.paused;
    this.locked = currentStatus.locked;
    this.autoPauseTime = currentStatus.autoPauseTime;

    // Get current facet
    this.currentFacetValue = await this.currentFacet(true);
  }

  /**
   * Get current facet
   * @param {boolean} force - Force query instead of using cached value
   * @returns {Promise<number>}
   */
  async currentFacet(force = false) {
    if (!this.logged) throw new NotLoggedInError();

    if (force) {
      const data = await this.baseCharRead('facet');
      this.currentFacetValue = readBigEndianInt(data);
    }

    return this.currentFacetValue;
  }

  // ============ Utilities ============

  /**
   * Write a command to command_input characteristic
   * @param {Buffer} command - The command
   * @param {boolean} check - Check if command was successful
   * @returns {Promise<boolean>}
   */
  async writeCommand(command, check = true) {
    if (!this.logged) throw new NotLoggedInError();

    await this.baseCharWrite('command_input', command);

    if (check) {
      const data = await this.baseCharRead('command_input');
      return data[0] === command[0] && data[1] === 0x02;
    }
    return true;
  }

  /**
   * Write a command and read result
   * @param {Buffer} command - The command
   * @param {boolean} check - Check if command was successful
   * @returns {Promise<Buffer>}
   */
  async writeCommandAndReadOutput(command, check = false) {
    if (!this.logged) throw new NotLoggedInError();

    const wentOk = await this.writeCommand(command, check);
    if (!wentOk) {
      throw new TimeFlipCommandError(command);
    }

    return await this.baseCharRead('command_result');
  }

  // ============ Version 4 Commands ============

  /**
   * Get time from TimeFlip internal clock (v4)
   * @returns {Promise<number>} Seconds since 1970
   */
  async _getTimeV4() {
    if (!this.logged) throw new NotLoggedInError();

    const command = Buffer.alloc(1);
    command[0] = COMMANDS.time_read[0];

    const data = await this.writeCommandAndReadOutput(command);
    return readBigEndianInt(data, 1, 5);
  }

  /**
   * Set time on TimeFlip internal clock (v4)
   * @param {number} time - Seconds since 1970
   * @returns {Promise<void>}
   */
  async _setTimeV4(time) {
    if (!this.logged) throw new NotLoggedInError();

    const command = Buffer.alloc(5);
    command[0] = COMMANDS.time_write[0];
    const timeBytes = writeBigEndianInt(time, 4);
    timeBytes.copy(command, 1);

    await this.writeCommand(command);
  }

  /**
   * Set brightness (v4)
   * @param {number} brightness - Brightness percent (0-100)
   * @returns {Promise<void>}
   */
  async _setBrightnessV4(brightness) {
    if (!this.logged) throw new NotLoggedInError();

    const command = Buffer.alloc(2);
    command[0] = COMMANDS.brightness_set[0];
    command[1] = brightness;

    await this.writeCommand(command);
  }

  /**
   * Set blink frequency (v4)
   * @param {number} blinkFrequency - Delay in seconds (5-60)
   * @returns {Promise<void>}
   */
  async _setBlinkFrequencyV4(blinkFrequency) {
    if (!this.logged) throw new NotLoggedInError();

    const command = Buffer.alloc(2);
    command[0] = COMMANDS.blink_freq_set[0];
    command[1] = blinkFrequency;

    await this.writeCommand(command);
  }

  /**
   * Set facet color (v4)
   * @param {number} facet - Facet number (0-24)
   * @param {[number, number, number]} rgb - RGB values (0-255 each)
   * @returns {Promise<void>}
   */
  async _setColorV4(facet, rgb) {
    if (!this.logged) throw new NotLoggedInError();

    const command = Buffer.alloc(5);
    command[0] = COMMANDS.color_set[0];
    command[1] = facet;
    command[2] = rgb[0];
    command[3] = rgb[1];
    command[4] = rgb[2];

    await this.writeCommand(command);
  }

  /**
   * Set facet mode and pomodoro time (v4)
   * @param {number} facet - Facet number (0-24)
   * @param {number} mode - Mode (0=normal, 1=pomodoro)
   * @param {number} pomodoro - Pomodoro timer limit in seconds
   * @returns {Promise<void>}
   */
  async _setFacetV4(facet, mode, pomodoro) {
    if (!this.logged) throw new NotLoggedInError();

    const command = Buffer.alloc(7);
    command[0] = COMMANDS.facet_write[0];
    command[1] = facet;
    command[2] = mode;
    const pomodoroBytes = writeBigEndianInt(pomodoro, 4);
    pomodoroBytes.copy(command, 3);

    await this.writeCommand(command, true);
  }

  /**
   * Get facet info (v4)
   * @param {number} facet - Facet number
   * @returns {Promise<{facet: number, mode: number, pomodoro: number, timer: number}>}
   */
  async _getFacetV4(facet) {
    if (!this.logged) throw new NotLoggedInError();

    const command = Buffer.alloc(2);
    command[0] = COMMANDS.facet_read[0];
    command[1] = facet;

    const data = await this.writeCommandAndReadOutput(command, true);

    return {
      facet: data[1],
      mode: data[2],
      pomodoro: readBigEndianInt(data, 3, 7),
      timer: readBigEndianInt(data, 7, 11)
    };
  }

  /**
   * Get all facets info (v4)
   * @returns {Promise<Array>}
   */
  async _getAllFacetsV4() {
    if (!this.logged) throw new NotLoggedInError();

    const facets = [];
    for (let i = 0; i < 12; i++) {
      const facetData = await this.getFacet(i);
      facets.push([facetData.facet, facetData.mode, facetData.pomodoro, facetData.timer]);
    }
    return facets;
  }

  /**
   * Get event data (v4)
   * @returns {Promise<string>}
   */
  async _getEventV4() {
    if (!this.logged) throw new NotLoggedInError();
    const data = await this.baseCharRead('event_data');
    return data.toString();
  }

  /**
   * Register event notification callback (v4)
   * @param {Function} eventCallback 
   * @returns {Promise<void>}
   */
  async registerNotifyEventV4(eventCallback) {
    if (!this.logged) throw new NotLoggedInError();

    const char = this.characteristics.event_data;
    await new Promise((resolve, reject) => {
      char.subscribe((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    char.on('data', eventCallback);
    this.eventNotifyActive = true;
  }

  /**
   * Unregister event notification (v4)
   * @returns {Promise<void>}
   */
  async unregisterNotifyEventV4() {
    if (!this.logged) throw new NotLoggedInError();

    const char = this.characteristics.event_data;
    await new Promise((resolve) => {
      char.unsubscribe((err) => resolve());
    });
    this.eventNotifyActive = false;
  }

  /**
   * Get history entry (v4)
   * @param {number} eventNum - Event number
   * @returns {Promise<{eventNumber: number, facet: number, timestamp: number, duration: number}>}
   */
  async _getHistoryV4(eventNum) {
    if (!this.logged) throw new NotLoggedInError();

    const command = Buffer.alloc(5);
    command[0] = 0x01;
    const eventBytes = writeBigEndianInt(eventNum, 4);
    eventBytes.copy(command, 1);

    await this.baseCharWrite('history_data', command);
    const data = await this.baseCharRead('history_data');

    return {
      eventNumber: readBigEndianInt(data, 0, 4),
      facet: data[4],
      timestamp: readBigEndianInt(data, 5, 13),
      duration: readLittleEndianInt(data, 13, 18)
    };
  }

  /**
   * Get all history (v4)
   * @returns {Promise<Array>}
   */
  async _getAllHistoryV4() {
    if (!this.logged) throw new NotLoggedInError();

    const historyBlocks = [];
    let eventNumber = 0;
    const zeros = Buffer.alloc(17, 0);

    while (true) {
      const command = Buffer.alloc(5);
      command[0] = 0x02;
      const eventBytes = writeBigEndianInt(eventNumber, 4);
      eventBytes.copy(command, 1);

      await this.baseCharWrite('history_data', command);
      const data = await this.baseCharRead('history_data');

      if (data.slice(0, 17).equals(zeros)) {
        break;
      }

      historyBlocks.push([
        readBigEndianInt(data, 0, 4),   // event number
        data[4],                         // facet
        readBigEndianInt(data, 5, 13),   // timestamp
        readLittleEndianInt(data, 13, 18) // duration
      ]);

      eventNumber++;
    }

    return historyBlocks;
  }

  /**
   * Register history notification callback (v4)
   * @param {Function} historyCallback 
   * @returns {Promise<void>}
   */
  async registerNotifyHistoryV4(historyCallback) {
    if (!this.logged) throw new NotLoggedInError();

    const char = this.characteristics.history_data;
    await new Promise((resolve, reject) => {
      char.subscribe((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    char.on('data', historyCallback);
    this.historyNotifyActive = true;
  }

  /**
   * Unregister history notification (v4)
   * @returns {Promise<void>}
   */
  async unregisterNotifyHistoryV4() {
    if (!this.logged) throw new NotLoggedInError();

    const char = this.characteristics.history_data;
    await new Promise((resolve) => {
      char.unsubscribe((err) => resolve());
    });
    this.historyNotifyActive = false;
  }

  // ============ Version 3 Commands ============

  /**
   * Register facet notification callback (v3)
   * @param {Function} facetCallback 
   * @returns {Promise<void>}
   */
  async registerNotifyFacetV3(facetCallback) {
    if (!this.logged) throw new NotLoggedInError();

    const char = this.characteristics.facet;
    await new Promise((resolve, reject) => {
      char.subscribe((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    char.on('data', facetCallback);
    this.facetNotifyActive = true;
  }

  /**
   * Unregister facet notification (v3)
   * @returns {Promise<void>}
   */
  async unregisterNotifyFacetV3() {
    if (!this.logged) throw new NotLoggedInError();

    const char = this.characteristics.facet;
    await new Promise((resolve) => {
      char.unsubscribe((err) => resolve());
    });
    this.facetNotifyActive = false;
  }

  /**
   * Get status (v3)
   * @returns {Promise<{locked: boolean, paused: boolean, autoPauseTime: number}>}
   */
  async _getStatusV3() {
    if (!this.logged) throw new NotLoggedInError();

    const data = await this.writeCommandAndReadOutput(COMMANDS.status);
    const isLocked = data[0] === 0x01;

    return {
      locked: isLocked,
      paused: isLocked ? true : data[1] === 0x01,
      autoPauseTime: isLocked ? 0 : readBigEndianInt(data, 2, 4)
    };
  }

  /**
   * Get calibration version (v3)
   * @returns {Promise<number>}
   */
  async _getCalibrationVersionV3() {
    if (!this.logged) throw new NotLoggedInError();
    const data = await this.baseCharRead('calibration_version');
    return readBigEndianInt(data);
  }

  /**
   * Set calibration version (v3)
   * @param {number} version 
   * @returns {Promise<void>}
   */
  async _setCalibrationVersionV3(version) {
    if (!this.logged) throw new NotLoggedInError();

    if (version >= 2 ** 32) {
      throw new Error(`${version} is too large (should be 4 bytes max)`);
    }

    const versionBytes = writeBigEndianInt(version, 4);
    await this.baseCharWrite('calibration_version', versionBytes);
  }

  /**
   * Get accelerometer value (v3)
   * @param {number} multiplier - Multiply all values (use 9.81 for m/s²)
   * @returns {Promise<[number, number, number]>}
   */
  async accelerometerValue(multiplier = 1.0) {
    if (!this.logged) throw new NotLoggedInError();

    const divider = 2 ** 14;
    const data = await this.baseCharRead('accelerometer_data');

    // Read as signed 16-bit little-endian values
    const ax = data.readInt16LE(0);
    const ay = data.readInt16LE(2);
    const az = data.readInt16LE(4);

    return [
      (ax / divider) * multiplier,
      (ay / divider) * multiplier,
      (az / divider) * multiplier
    ];
  }

  /**
   * Set paused state (v3)
   * @param {boolean} state 
   * @param {boolean} force 
   * @returns {Promise<boolean>}
   */
  async _setPausedV3(state, force = false) {
    if (!this.logged) throw new NotLoggedInError();

    if (force || state !== this.paused) {
      await this.writeCommand(state ? COMMANDS.pause_on : COMMANDS.pause_off, true);
      this.paused = state;
    }

    return this.paused;
  }

  /**
   * Set lock state (v3)
   * @param {boolean} state 
   * @param {boolean} force 
   * @returns {Promise<boolean>}
   */
  async _setLockV3(state, force = false) {
    if (!this.logged) throw new NotLoggedInError();

    if (force || state !== this.locked) {
      await this.writeCommand(state ? COMMANDS.lock_on : COMMANDS.lock_off);
      this.locked = state;
    }

    return this.locked;
  }

  /**
   * Set auto-pause time (v3)
   * @param {number} time - Time in minutes
   * @returns {Promise<void>}
   */
  async _setAutoPauseV3(time) {
    if (!this.logged) throw new NotLoggedInError();

    if (time >= 2 ** 16) {
      throw new Error('time should be only two bytes');
    }

    const command = Buffer.alloc(3);
    command[0] = 0x05;
    command.writeUInt16BE(time, 1);

    await this.writeCommand(command, true);
    this.autoPauseTime = time;
  }

  /**
   * Set device name (v3)
   * @param {string} name 
   * @returns {Promise<boolean>}
   */
  async _setNameV3(name) {
    if (!this.logged) throw new NotLoggedInError();

    const nameBuffer = Buffer.from(name, 'ascii');
    if (nameBuffer.length > 19) {
      throw new Error(`"${name}" is too long`);
    }

    const command = Buffer.alloc(2 + nameBuffer.length);
    command[0] = 0x15;
    command[1] = nameBuffer.length;
    nameBuffer.copy(command, 2);

    return await this.writeCommand(command, true);
  }

  /**
   * Set password (v3)
   * @param {string} password - 6-character password
   * @returns {Promise<boolean>}
   */
  async _setPasswordV3(password) {
    if (!this.logged) throw new NotLoggedInError();

    const passwordBuffer = Buffer.from(password, 'ascii');
    if (passwordBuffer.length !== 6) {
      throw new Error('Password should be 6 characters long');
    }

    const command = Buffer.alloc(7);
    command[0] = 0x30;
    passwordBuffer.copy(command, 1);

    return await this.writeCommand(command, true);
  }

  /**
   * Get history (v3)
   * @returns {Promise<Array<[number, number, Buffer]>>}
   */
  async history() {
    if (!this.logged) throw new NotLoggedInError();

    await this.writeCommand(COMMANDS.history);

    const zeros = Buffer.alloc(21, 0);
    const historyBlocks = [];
    let firstPack = null;

    while (true) {
      const data = await this.baseCharRead('command_result');

      if (data.equals(zeros)) {
        break;
      }

      firstPack = data.slice(0, 2);

      for (let i = 0; i < 7; i++) {
        const dx = data.slice(i * 3, (i + 1) * 3);
        const dxe = Buffer.from(dx);
        dxe[2] = ((dx[2] << 6) % 256) >> 6;
        historyBlocks.push([
          dx[2] >> 2,
          readBigEndianInt(dxe),
          dx
        ]);
      }
    }

    const numBlocks = readBigEndianInt(firstPack);
    return historyBlocks.slice(0, numBlocks);
  }

  /**
   * Delete history (v3)
   * @returns {Promise<void>}
   */
  async historyDelete() {
    if (!this.logged) throw new NotLoggedInError();
    await this.writeCommand(COMMANDS.history_delete);
  }

  /**
   * Reset calibration
   * @returns {Promise<void>}
   */
  async calibrationReset() {
    if (!this.logged) throw new NotLoggedInError();
    await this.writeCommand(COMMANDS.calibration_reset);
  }

  /**
   * Deprecated function placeholder
   */
  async _deprecatedFunction() {
    throw new DeprecatedFunctionError();
  }

  /**
   * Unimplemented function placeholder
   */
  async _unimplementedFunction() {
    throw new UnimplementedFunctionError();
  }
}

export default AsyncClient;
