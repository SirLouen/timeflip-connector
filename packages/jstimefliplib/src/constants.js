/**
 * TimeFlip constants and characteristics
 */

export const TWENTY_ZEROES = Buffer.alloc(20, 0x00);

export const UUID_GENERIC = (code) => `0000${code.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
export const UUID_TIMEFLIP = (code) => `f119${code.toString(16).padStart(4, '0')}-71a4-11e6-bdf4-0800200c9a66`;

export const DEFAULT_PASSWORD = '000000';

export const BLUETOOTH_ENDIANNESS = 'LE';
export const TIMEFLIP_ENDIANNESS = 'BE';

export const CHARACTERISTICS = {
  // generic
  battery_level: UUID_GENERIC(0x2a19),
  firmware_revision: UUID_GENERIC(0x2a26),
  device_name: UUID_GENERIC(0x2a00),

  // timeflip
  event_data: UUID_TIMEFLIP(0x6f51),  // vers 4.0
  accelerometer_data: UUID_TIMEFLIP(0x6f51),  // vers 3.0
  facet: UUID_TIMEFLIP(0x6f52),
  command_result: UUID_TIMEFLIP(0x6f53),
  command_input: UUID_TIMEFLIP(0x6f54),
  double_tap: UUID_TIMEFLIP(0x6f55),  // "double tap" is reserved for future use
  calibration_version: UUID_TIMEFLIP(0x6f56),  // vers 3.0
  system_state: UUID_TIMEFLIP(0x6f56),  // vers 4.0
  password_input: UUID_TIMEFLIP(0x6f57),
  history_data: UUID_TIMEFLIP(0x6f58),
};

// This is per the v 4.0 specification
export const CHARACTERISTIC_READ_LENGTHS = {
  // generic
  battery_level: 1,
  firmware_revision: 20,
  device_name: 20,

  // timeflip
  event_data: 20,
  accelerometer_data: 6,  // version 3 only
  facet: 1,
  command_result: 20,
  command_input: 2,
  double_tap: -1,
  system_state: 4,
  calibration_version: 4,  // vers 3 only
  password_input: -1,
  history_data: 20
};

export const CHARACTERISTIC_WRITE_LENGTHS = {
  // generic
  battery_level: -1,
  firmware_revision: -1,
  device_name: -1,

  // timeflip
  event_data: -1,
  accelerometer_data: -1,
  facet: -1,
  command_result: -1,
  command_input: 20,
  double_tap: -1,
  system_state: -1,
  calibration_version: 4,  // vers 3 only
  password_input: 6,
  history_data: 20
};

export const CHARACTERISTIC_NOTIFY_LENGTHS = {
  // generic
  battery_level: 1,
  firmware_revision: -1,
  device_name: -1,

  // timeflip
  event_data: 20,
  accelerometer_data: -1,
  facet: 1,
  command_result: 20,
  command_input: 20,
  double_tap: -1,
  system_state: 4,
  calibration_version: -1,
  password_input: 6,
  history_data: 20
};

/**
 * Create command bytearray
 * @param {number|number[]} x 
 * @returns {Buffer}
 */
function _com(x) {
  return Buffer.from(Array.isArray(x) ? x : [x]);
}

export const COMMANDS = {
  history: _com(0x01),
  history_delete: _com(0x02),  // version 3
  history_dump: _com(0x02),    // version 4
  calibration_reset: _com(0x03),
  lock_on: _com([0x04, 0x01]),
  lock_off: _com([0x04, 0x02]),
  auto_pause_set: _com(0x05),
  pause_on: _com([0x06, 0x01]),
  pause_off: _com([0x06, 0x02]),
  time_read: _com(0x07),
  time_write: _com(0x08),
  brightness_set: _com(0x09),
  blink_freq_set: _com(0x0A),
  status: _com(0x10),
  color_set: _com(0x11),
  facet_write: _com(0x13),
  facet_read: _com(0x14),
  set_password: _com(0x30)
};
