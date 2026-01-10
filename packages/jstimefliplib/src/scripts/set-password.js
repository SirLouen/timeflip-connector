#!/usr/bin/env node
/**
 * Set TimeFlip device password
 */

import { runOnClient, RuntimeClientError } from './utils.js';

function addExtraOptions(program) {
  program.argument('<new_password>', 'New device password (6 characters)');
}

async function actionsOnClient(client, options) {
  const newPassword = options.args[0];

  if (await client.setPassword(newPassword)) {
    console.log(`! Changed password to "${newPassword}"`);
  } else {
    throw new RuntimeClientError('Something went wrong while changing password');
  }
}

runOnClient(
  'Set a new password on the device',
  addExtraOptions,
  actionsOnClient
);
