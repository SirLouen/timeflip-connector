#!/usr/bin/env node
/**
 * Get TimeFlip device characteristics
 */

import { runOnClient, RuntimeClientError } from './utils.js';

async function actionsOnClient(client, options) {
  // Get characteristics
  console.log('TimeFlip characteristics::');
  console.log('- Name:', await client.deviceName());
  console.log('- Firmware:', await client.firmwareRevision());
  console.log('- Battery:', await client.batteryLevel());
  console.log('- Current facet:', await client.currentFacet());

  if (client.firmwareVersion < 3.47) {
    const accel = await client.accelerometerValue();
    console.log('- Accelerometer vector:', accel.map(x => x.toFixed(3)).join(', '));
    console.log('- Status:', await client.status());

    // Print history
    console.log('History::');
    const history = await client.history();
    const totalTime = history.reduce((sum, h) => sum + h[1], 0);
    let start = new Date();
    start.setMilliseconds(0);
    start = new Date(start.getTime() - totalTime * 1000);

    for (const [facet, duration, orig] of history) {
      const end = new Date(start.getTime() + duration * 1000);
      console.log(`- Facet=${facet} (${duration} seconds): from ${start.toISOString()} to ${end.toISOString()}`);
      start = end;
    }
  } else {
    console.log('- Status:', await client.getStatus());

    console.log('Facets::');
    const facets = await client.getAllFacets();
    for (const [number, mode, pomodoro, timer] of facets) {
      console.log(`- Facet=${number} mode: ${mode}, pomodoro time: ${pomodoro}, timer: ${timer}`);
    }

    // Print history
    console.log('History::');
    const history = await client.getAllHistory();
    for (const [number, facet, orig, duration] of history) {
      console.log(`- Event ${number} on facet ${facet} (${duration} seconds) from ${orig}`);
    }

    // Print event
    const event = await client.getEvent();
    console.log('Event:', event);
  }
}

runOnClient(
  'Get TimeFlip device characteristics',
  null,
  actionsOnClient
);
