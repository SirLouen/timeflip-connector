#!/usr/bin/env node
/**
 * Discover TimeFlip devices
 */

import noble from '@abandonware/noble';
import { CHARACTERISTICS } from '../constants.js';

/**
 * Normalize UUID for comparison
 * @param {string} uuid 
 * @returns {string}
 */
function normalizeUUID(uuid) {
  return uuid.toLowerCase().replace(/-/g, '');
}

async function run() {
  const devicesMap = {
    connectionIssue: [],
    notTimeflip: [],
    timeflip: []
  };

  process.stdout.write('Looking around (this can take up to 1 minute) ...');

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      noble.stopScanning();
      printResults(devicesMap);
      resolve();
    }, 60000);

    const discoveredDevices = new Map();

    noble.on('discover', async (peripheral) => {
      const id = peripheral.id || peripheral.address;
      if (discoveredDevices.has(id)) return;
      discoveredDevices.set(id, true);

      try {
        await new Promise((resolve, reject) => {
          const connectTimeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000);

          peripheral.connect((err) => {
            clearTimeout(connectTimeout);
            if (err) reject(err);
            else resolve();
          });
        });

        await new Promise((resolve, reject) => {
          peripheral.discoverAllServicesAndCharacteristics((err, services, characteristics) => {
            if (err) {
              reject(err);
              return;
            }

            // Check if device has TimeFlip facet characteristic
            const facetUuid = normalizeUUID(CHARACTERISTICS.facet);
            const hasTimeflipChar = characteristics.some(
              char => normalizeUUID(char.uuid) === facetUuid
            );

            if (hasTimeflipChar) {
              devicesMap.timeflip.push({
                address: peripheral.address || peripheral.id,
                name: peripheral.advertisement?.localName || 'Unknown'
              });
            } else {
              devicesMap.notTimeflip.push({
                address: peripheral.address || peripheral.id,
                name: peripheral.advertisement?.localName || 'Unknown'
              });
            }
            resolve();
          });
        });

        peripheral.disconnect();
      } catch (err) {
        devicesMap.connectionIssue.push({
          address: peripheral.address || peripheral.id
        });
        try {
          peripheral.disconnect();
        } catch (e) {
          // Ignore
        }
      }
    });

    noble.on('stateChange', (state) => {
      if (state === 'poweredOn') {
        noble.startScanning([], true);
      }
    });

    if (noble.state === 'poweredOn') {
      noble.startScanning([], true);
    }

    // Also allow early exit with Ctrl+C
    process.on('SIGINT', () => {
      noble.stopScanning();
      clearTimeout(timeout);
      printResults(devicesMap);
      process.exit(0);
    });
  });
}

function printResults(devicesMap) {
  console.log(' Done!');
  console.log('Results::');
  
  const timeflipStr = devicesMap.timeflip
    .map(d => `${d.address} (${d.name})`)
    .join(', ') || 'None found';
  console.log('- TimeFlip devices:', timeflipStr);
  
  const otherBleStr = devicesMap.notTimeflip
    .map(d => `${d.address} (${d.name})`)
    .join(', ') || 'None found';
  console.log('- Other BLE devices:', otherBleStr);
  
  const connectionIssueStr = devicesMap.connectionIssue
    .map(d => d.address)
    .join(', ') || 'None';
  console.log('- Other devices:', connectionIssueStr);
}

run().then(() => process.exit(0)).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
