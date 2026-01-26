/**
 * Web Server for TimeFlip Connector
 * Provides a simple web interface to view device status and manage facets
 */

import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = join(__dirname, '..', 'config', 'facets.json');
const statePath = join(__dirname, '..', 'config', 'state.json');

// TimeTagger API reference (will be set by main app)
let timeTaggerApi = null;

/**
 * Set the TimeTagger API reference
 * @param {Object} api - The TimeTagger API instance
 */
export function setTimeTaggerApi(api) {
  timeTaggerApi = api;
}

/**
 * Load facet configuration from file
 * @returns {Object} - The facet configuration
 */
function loadConfig() {
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const configData = readFileSync(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(`Error reading config: ${error.message}`);
    return null;
  }
}

/**
 * Load state from file
 * @returns {Object} - The state data
 */
function loadState() {
  if (!existsSync(statePath)) {
    return null;
  }
  try {
    const stateData = readFileSync(statePath, 'utf-8');
    return JSON.parse(stateData);
  } catch (error) {
    console.error(`Error reading state: ${error.message}`);
    return null;
  }
}

/**
 * Save facet configuration to file
 * @param {Object} config - The configuration to save
 * @returns {boolean} - Success status
 */
function saveConfig(config) {
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error(`Error saving config: ${error.message}`);
    return false;
  }
}

/**
 * Start the web server
 * @param {number} port - Port to listen on
 * @returns {Object} - Express app and server instance
 */
export function startWebServer(port = 3000) {
  const app = express();
  
  // Middleware
  app.use(express.json());
  app.use(express.static(join(__dirname, '..', 'public')));
  
  // API Routes
  
  // Get current status - fetches everything directly from TimeTagger
  app.get('/api/status', async (req, res) => {
    try {
      // Get current running record directly from TimeTagger
      let currentRecord = null;
      let currentFacetName = null;
      
      if (timeTaggerApi) {
        currentRecord = await timeTaggerApi.getRunningRecord();
        if (currentRecord && currentRecord.ds) {
          // Extract facet name from the description tag (e.g., "#gaming" -> "gaming")
          currentFacetName = currentRecord.ds.replace('#', '');
        }
      }
      
      // Load state from state.json
      const state = loadState();
      
      res.json({
        currentFacetName: currentFacetName,
        isTracking: currentRecord !== null,
        currentRecord: currentRecord,
        lastFacetName: state?.currentFacetName || null,
        lastFacetChangeTime: state?.lastFacetChangeTime || null
      });
    } catch (error) {
      console.error('[WebServer] Error fetching status:', error.message);
      res.status(500).json({ error: 'Failed to fetch status' });
    }
  });
  
  // Get facet configuration
  app.get('/api/facets', (req, res) => {
    const config = loadConfig();
    if (config) {
      res.json(config);
    } else {
      res.status(500).json({ error: 'Failed to load configuration' });
    }
  });
  
  // Update facet configuration
  app.post('/api/facets', (req, res) => {
    const newConfig = req.body;
    
    // Validate the configuration
    if (!newConfig.facets || typeof newConfig.facets !== 'object') {
      return res.status(400).json({ error: 'Invalid configuration: facets object required' });
    }
    
    if (!newConfig.stopFacet || typeof newConfig.stopFacet !== 'number') {
      return res.status(400).json({ error: 'Invalid configuration: stopFacet number required' });
    }
    
    // Preserve settleDelayMs and description if not provided
    const currentConfig = loadConfig();
    if (currentConfig) {
      if (!newConfig.settleDelayMs) {
        newConfig.settleDelayMs = currentConfig.settleDelayMs || 5000;
      }
      if (!newConfig.description) {
        newConfig.description = currentConfig.description;
      }
    }
    
    if (saveConfig(newConfig)) {
      // Update the app state config
      appState.config = newConfig;
      res.json({ success: true, message: 'Configuration saved. Restart the app to apply changes.' });
    } else {
      res.status(500).json({ error: 'Failed to save configuration' });
    }
  });
  
  // Serve the main page
  app.get('/', (req, res) => {
    res.sendFile(join(__dirname, '..', 'public', 'index.html'));
  });
  
  // Start server
  const server = app.listen(port, () => {
    console.log(`🌐 Web interface available at: http://localhost:${port}`);
  });
  
  return { app, server };
}
