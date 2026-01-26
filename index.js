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
import { startWebServer, setTimeTaggerApi } from './src/webServer.js';
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
const WEB_PORT = parseInt(process.env.WEB_PORT || '3000', 10);

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
let lastConfirmedFacet = null;  // For deduplication only

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
  try {
    const facetName = getFacetName(facetNumber);
    const timestamp = new Date().toLocaleTimeString();
    
    console.log(`\n✅ [${timestamp}] Facet confirmed: ${facetNumber} (${facetName})`);
    
    // Update last confirmed for deduplication
    lastConfirmedFacet = facetNumber;
    
    // Check if this is the stop facet
    if (isStopFacet(facetNumber)) {
      await stopTracking();
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
        return;
      }
    }
    
    // Start new tracking
    await startTracking(facetNumber);
  } catch (error) {
    console.error(`❌ [handleConfirmedFacetChange] Error: ${error.message}`);
    console.error(error.stack);
  }
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
  
  // If same as last confirmed and no pending, ignore
  if (facet === lastConfirmedFacet && !pendingFacet) {
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
    try {
      settleTimer = null;
      const confirmedFacetNumber = pendingFacet;
      pendingFacet = null;
      
      await handleConfirmedFacetChange(confirmedFacetNumber);
    } catch (error) {
      console.error(`❌ [SettleTimer] Error: ${error.message}`);
      console.error(error.stack);
    }
  }, settleDelay);
}

/**
 * Callback function when device disconnects
 * This is expected behavior for BLE devices - they disconnect after brief interaction
 * @param {AsyncClient} clientInstance - The client instance
 */
async function onDisconnect(clientInstance) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] 💤 TimeFlip device went to sleep (normal BLE behavior)`);
  
  // Note: We do NOT stop tracking or change state on disconnect
  // The timer continues running in TimeTagger until the next facet change
  // This is correct because the TimeFlip only wakes up on physical interaction
  
  // Resolve the disconnect promise if it exists (to continue the main loop)
  if (clientInstance._disconnectResolve) {
    clientInstance._disconnectResolve();
    clientInstance._disconnectResolve = null;
  }
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
  
  // Start web server with TimeTagger API reference
  setTimeTaggerApi(timeTaggerApi);
  startWebServer(WEB_PORT);
  
  // Check if there's already a running record in TimeTagger
  console.log('\n🔍 Checking for running timer in TimeTagger...');
  const runningRecord = await timeTaggerApi.getRunningRecord();
  
  if (runningRecord) {
    console.log(`   Found running timer: ${runningRecord.ds}`);
    currentRecord = runningRecord;
  } else {
    console.log('   No running timer found');
  }
  
  console.log('\n💡 TimeFlip BLE Behavior:');
  console.log('   The TimeFlip device is normally asleep and disconnected.');
  console.log('   It only wakes up briefly when you flip it to change facets.');
  console.log('   This connector will detect facet changes when the device wakes up.');
  console.log('');
  
  // Create client with disconnect callback
  client = new AsyncClient(DEVICE_ADDRESS, onDisconnect);
  
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
    
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    console.log('👋 Disconnected. Goodbye!');
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // Main connection loop
  console.log(`👂 Waiting for TimeFlip device: ${DEVICE_ADDRESS}`);
  console.log('   (Flip the device to wake it up and register facet changes)\n');
  
  // Connect and let the callbacks handle everything
  const connectLoop = async () => {
    while (true) {
      try {
        // Try to connect to the device
        await client.connect();
        
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ✅ Device woke up - connected!`);
        
        // Setup client with facet change callback and password
        await client.setup(onFacetChange, PASSWORD);
        
        // Get current facet
        const currentFacet = await client.currentFacet(true);
        const currentFacetName = getFacetName(currentFacet);
        
        console.log(`[${timestamp}] 🎲 Current facet: ${currentFacet} (${currentFacetName})`);
        
        // If facet changed from last known, trigger the facet change handler
        // The onFacetChange callback will handle the settle delay
        if (currentFacet !== lastConfirmedFacet) {
          onFacetChange(currentFacet);
        }
        
        // Wait until disconnected - the device will go to sleep on its own
        // The onDisconnect callback is called by AsyncClient automatically
        // We need to wait for that to happen before trying to reconnect
        await new Promise(resolve => {
          // Store resolve to be called when disconnect happens
          client._disconnectResolve = resolve;
        });
        
      } catch (error) {
        // Connection timeout is expected - device is asleep
        if (!error.message.includes('timeout') && !error.message.includes('connect')) {
          // Log unexpected errors
          const timestamp = new Date().toLocaleTimeString();
          console.log(`[${timestamp}] ⚠️  Unexpected error: ${error.message}`);
        }
        
        try {
          await client.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
      
      // Brief pause before next connection attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Recreate client for next connection attempt
      client = new AsyncClient(DEVICE_ADDRESS, onDisconnect);
    }
  };
  
  connectLoop();
}

// Run the app
main();
