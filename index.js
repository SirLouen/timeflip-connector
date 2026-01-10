#!/usr/bin/env node
/**
 * TimeFlip Node.js App with TimeTagger Integration
 * 
 * Features:
 * - Connects to TimeFlip device via Bluetooth LE
 * - Monitors facet changes with 5-second settle delay
 * - Starts/stops timers in TimeTagger based on active facet
 * - One facet (configurable) serves as "stop" to stop the timer
 */

import 'dotenv/config';
import { AsyncClient, DEFAULT_PASSWORD } from 'jstimefliplib';
import { timeTaggerApi } from './src/timeTaggerApi.js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration from .env file
const DEVICE_ADDRESS = process.env.TIMEFLIP_ADDRESS || '00:11:22:33:44:55';
const PASSWORD = process.env.TIMEFLIP_PASSWORD || DEFAULT_PASSWORD;
const API_TOKEN = process.env.TIMETAGGER_TOKEN || '';

// Load facet configuration
function loadFacetConfig() {
  const configPath = join(__dirname, 'config', 'facets.json');
  
  if (!existsSync(configPath)) {
    console.error(`❌ Configuration file not found: ${configPath}`);
    console.log('   Please create config/facets.json with your facet names');
    process.exit(1);
  }
  
  try {
    const configData = readFileSync(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(`❌ Error reading config file: ${error.message}`);
    process.exit(1);
  }
}

// Global state
let config = null;
let client = null;
let currentRecord = null;
let settleTimer = null;
let pendingFacet = null;
let confirmedFacet = null;

/**
 * Get facet name from config
 * @param {number} facetNumber - The facet number (1-12)
 * @returns {string} - The facet name
 */
function getFacetName(facetNumber) {
  return config.facets[facetNumber] || `facet_${facetNumber}`;
}

/**
 * Check if facet is the stop facet
 * @param {number} facetNumber - The facet number
 * @returns {boolean}
 */
function isStopFacet(facetNumber) {
  const stopFacet = config.stopFacet || 12;
  // Compare as numbers to handle string/int mismatch
  return Number(facetNumber) === Number(stopFacet);
}

/**
 * Format duration in human readable format
 * @param {number} seconds - Duration in seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Start tracking a new activity
 * @param {number} facetNumber - The facet number
 */
async function startTracking(facetNumber) {
  const facetName = getFacetName(facetNumber);
  
  console.log(`\n🚀 Starting timer for: #${facetName}`);
  
  try {
    currentRecord = await timeTaggerApi.startTracking(facetName);
    console.log(`   Timer started at: ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    console.error(`❌ Failed to start tracking: ${error.message}`);
  }
}

/**
 * Stop the current tracking
 */
async function stopTracking() {
  if (!currentRecord) {
    console.log('\n⏹️  No active timer to stop');
    return;
  }
  
  console.log(`\n⏹️  Stopping timer for: ${currentRecord.ds}`);
  
  try {
    const stoppedRecord = await timeTaggerApi.stopTracking(currentRecord);
    const duration = stoppedRecord.t2 - stoppedRecord.t1;
    console.log(`   Timer stopped at: ${new Date().toLocaleTimeString()}`);
    console.log(`   Duration: ${formatDuration(duration)}`);
    currentRecord = null;
  } catch (error) {
    console.error(`❌ Failed to stop tracking: ${error.message}`);
  }
}

/**
 * Handle confirmed facet change (after settle delay)
 * @param {number} facetNumber - The confirmed facet number
 */
async function handleConfirmedFacetChange(facetNumber) {
  const facetName = getFacetName(facetNumber);
  const timestamp = new Date().toLocaleTimeString();
  
  console.log(`\n✅ [${timestamp}] Facet confirmed: ${facetNumber} (${facetName})`);
  
  // Check if this is the stop facet
  if (isStopFacet(facetNumber)) {
    await stopTracking();
    confirmedFacet = facetNumber;
    return;
  }
  
  // If there's an active record for a different activity, stop it first
  if (currentRecord) {
    const currentFacetName = currentRecord.ds.replace('#', '');
    if (currentFacetName !== facetName.replace(/\s+/g, '_').toLowerCase()) {
      console.log(`   Switching from ${currentRecord.ds} to #${facetName}`);
      await stopTracking();
    } else {
      console.log(`   Already tracking #${facetName}, no change needed`);
      confirmedFacet = facetNumber;
      return;
    }
  }
  
  // Start new tracking
  await startTracking(facetNumber);
  confirmedFacet = facetNumber;
}

/**
 * Callback function when the facet changes
 * Implements 5-second settle delay to avoid rapid switches
 * @param {number} facet - The new facet number
 */
function onFacetChange(facet) {
  const timestamp = new Date().toLocaleTimeString();
  const facetName = getFacetName(facet);
  const settleDelay = config.settleDelayMs || 5000;
  
  console.log(`[${timestamp}] 🎲 Facet changed to: ${facet} (${facetName})`);
  
  // If same as pending, ignore (debounce)
  if (facet === pendingFacet) {
    return;
  }
  
  // If same as confirmed and no pending, ignore
  if (facet === confirmedFacet && !pendingFacet) {
    console.log(`   (Already confirmed, ignoring)`);
    return;
  }
  
  // Cancel any pending settle timer
  if (settleTimer) {
    console.log(`   (Cancelling previous settle timer)`);
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  
  // Set new pending facet
  pendingFacet = facet;
  
  // Start settle timer
  console.log(`   ⏳ Waiting ${settleDelay / 1000}s to confirm...`);
  settleTimer = setTimeout(async () => {
    settleTimer = null;
    const confirmedFacetNumber = pendingFacet;
    pendingFacet = null;
    
    await handleConfirmedFacetChange(confirmedFacetNumber);
  }, settleDelay);
}

/**
 * Callback function when device disconnects
 * @param {AsyncClient} clientInstance - The client instance
 */
async function onDisconnect(clientInstance) {
  console.log('\n⚠️  Device disconnected!');
  
  // Stop any active tracking
  if (currentRecord) {
    console.log('   Stopping active timer due to disconnect...');
    await stopTracking();
  }
  
  process.exit(1);
}

/**
 * Display configuration summary
 */
function displayConfig() {
  console.log('\n📋 Facet Configuration:');
  console.log('─────────────────────────────────────');
  
  for (let i = 1; i <= 12; i++) {
    const name = getFacetName(i);
    const isStop = isStopFacet(i);
    const marker = isStop ? ' ⏹️  (STOP)' : '';
    console.log(`   Facet ${i.toString().padStart(2)}: #${name}${marker}`);
  }
  
  console.log(`\n   Settle delay: ${config.settleDelayMs / 1000}s`);
  console.log('─────────────────────────────────────');
}

/**
 * Main function to connect to TimeFlip and monitor facets
 */
async function main() {
  console.log('🔵 TimeFlip + TimeTagger Integration');
  console.log('=====================================\n');
  
  // Load configuration
  config = loadFacetConfig();
  
  // Check API token
  if (!API_TOKEN) {
    console.error('❌ TIMETAGGER_TOKEN environment variable is required');
    console.log('   Set it using: export TIMETAGGER_TOKEN=your_token');
    process.exit(1);
  }
  
  // Set API token
  timeTaggerApi.setApiToken(API_TOKEN);
  
  // Display configuration
  displayConfig();
  
  // Create client with disconnect callback
  client = new AsyncClient(DEVICE_ADDRESS, onDisconnect);
  
  try {
    // Connect to the device
    console.log(`\n🔍 Searching for TimeFlip device: ${DEVICE_ADDRESS}`);
    console.log('   (Make sure to wake up the device by flipping it!)\n');
    
    await client.connect();
    console.log('✅ Connected to TimeFlip device!\n');
    
    // Setup client with facet change callback and password
    console.log('🔐 Logging in...');
    await client.setup(onFacetChange, PASSWORD);
    console.log('✅ Setup complete!\n');
    
    // Display device information
    console.log('📱 Device Information:');
    console.log('─────────────────────────────────────');
    console.log(`   Name:     ${await client.deviceName()}`);
    console.log(`   Firmware: ${await client.firmwareRevision()}`);
    const battery = await client.batteryLevel();
    console.log(`   Battery:  ${battery >= 0 ? battery + '%' : 'N/A'}`);
    
    // Get current facet
    const currentFacet = await client.currentFacet(true);
    const currentFacetName = getFacetName(currentFacet);
    confirmedFacet = currentFacet;
    
    console.log(`\n🎲 Current facet: ${currentFacet} (${currentFacetName})`);
    
    // Check if there's already a running record in TimeTagger
    console.log('\n🔍 Checking for running timer in TimeTagger...');
    const runningRecord = await timeTaggerApi.getRunningRecord();
    
    if (runningRecord) {
      console.log(`   Found running timer: ${runningRecord.ds}`);
      currentRecord = runningRecord;
      
      // Check if current facet matches the running record
      const runningFacetName = runningRecord.ds.replace('#', '');
      const expectedFacetName = currentFacetName.replace(/\s+/g, '_').toLowerCase();
      
      if (runningFacetName !== expectedFacetName && !isStopFacet(currentFacet)) {
        console.log(`   Facet doesn't match running timer, will switch after settle delay`);
      }
    } else {
      console.log('   No running timer found');
      
      // If current facet is not stop, start tracking
      if (!isStopFacet(currentFacet)) {
        console.log(`   Starting timer for current facet: #${currentFacetName}`);
        await startTracking(currentFacet);
      }
    }
    
    // Keep the app running to listen for facet changes
    console.log('\n👂 Listening for facet changes...');
    console.log('   (Flip the TimeFlip to switch activities)');
    console.log('   (Press Ctrl+C to exit)\n');
    
    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\n\n🛑 Shutting down...');
      
      // Cancel settle timer
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      
      // Stop any active tracking
      if (currentRecord) {
        console.log('   Stopping active timer...');
        await stopTracking();
      }
      
      await client.disconnect();
      console.log('👋 Disconnected. Goodbye!');
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    // Keep the process alive
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('timeout')) {
      console.log('\n💡 Tips:');
      console.log('   - Make sure your TimeFlip device is nearby and awake');
      console.log('   - Flip the device to wake it up before running this app');
      console.log('   - Set the correct address: TIMEFLIP_ADDRESS=xx:xx:xx:xx:xx:xx');
    }
    
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    
    process.exit(1);
  }
}

// Run the app
main();
