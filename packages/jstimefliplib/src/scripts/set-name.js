#!/usr/bin/env node
/**
 * Set TimeFlip device name
 */

import { runOnClient, RuntimeClientError } from './utils.js';

function addExtraOptions(program) {
  program.argument('<name>', 'New device name');
}

async function actionsOnClient(client, options) {
  const newName = options.args[0];
  
  // Get current name
  const currentName = await client.deviceName();

  // Set new name
  if (await client.setName(newName)) {
    console.log(`! Changed device name from "${currentName}" to "${newName}"`);
  } else {
    throw new RuntimeClientError('Something went wrong while changing name');
  }
}

runOnClient(
  'Set a new name for the TimeFlip device',
  addExtraOptions,
  actionsOnClient
);
