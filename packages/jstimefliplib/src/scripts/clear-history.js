#!/usr/bin/env node
/**
 * Clear TimeFlip device history
 */

import { runOnClient } from './utils.js';

async function actionsOnClient(client, options) {
  await client.historyDelete();
  console.log('! Cleared history');
}

runOnClient(
  'Clear history',
  null,
  actionsOnClient
);
