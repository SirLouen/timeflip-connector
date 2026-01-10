/**
 * Shared utilities for CLI scripts
 */

import { program } from 'commander';
import { AsyncClient } from '../async-client.js';
import { DEFAULT_PASSWORD } from '../constants.js';
import { VERSION } from '../index.js';

/**
 * Custom error for runtime client issues
 */
export class RuntimeClientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuntimeClientError';
  }
}

/**
 * Connect to TimeFlip and run actions
 * @param {object} options - CLI options
 * @param {Function} actionsOnClient - Async function to run with client
 */
export async function connectAndRun(options, actionsOnClient) {
  const client = new AsyncClient(options.address);

  try {
    await client.connect();
    console.log(`! Connected to ${options.address}`);

    await client.setup(null, options.password);
    console.log('! Password communicated');

    await actionsOnClient(client, options);
  } catch (err) {
    console.error(`Communication error: ${err.message}`);
    process.exit(1);
  } finally {
    try {
      await client.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
  }
}

/**
 * Setup CLI program with common options and run
 * @param {string} description - Program description
 * @param {Function} addExtraOptions - Function to add extra CLI options
 * @param {Function} actionsOnClient - Async function to run with client
 */
export function runOnClient(description, addExtraOptions, actionsOnClient) {
  program
    .name('timeflip')
    .description(description)
    .version(VERSION)
    .requiredOption('-a, --address <address>', 'Address of the TimeFlip device')
    .option('-p, --password <password>', 'Password', DEFAULT_PASSWORD);

  // Add any extra options
  if (addExtraOptions) {
    addExtraOptions(program);
  }

  program.parse();

  const options = program.opts();
  
  // Get positional arguments if any
  const args = program.args;

  connectAndRun({ ...options, args }, actionsOnClient)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

export default { runOnClient, connectAndRun, RuntimeClientError };
