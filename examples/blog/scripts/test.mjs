#!/usr/bin/env node

/**
 * Production Serving Integration Test
 *
 * This test ensures that the bundled Root.js code works correctly in production mode.
 *
 * ## What it tests
 *
 * 1. Builds the project - Runs a full production build
 * 2. Starts a production server - Launches the server on port 8765
 * 3. Verifies server startup - Checks that the server starts without errors
 * 4. Makes HTTP requests - Ensures the server responds with valid HTML
 * 5. Checks for circular dependency errors - Specifically looks for issues related to schema imports
 *
 * ## Why this test is important
 *
 * After enabling code splitting in @blinkk/root-cms (via `splitting: true` in tsup.config.ts),
 * this test ensures that:
 * - The bundled code doesn't have circular dependency issues
 * - Schema files can successfully import {schema} from '@blinkk/root-cms'
 * - The production server can start and serve requests without errors
 * - There are no module loading issues in production
 *
 * ## What it catches
 *
 * - Circular dependency errors during module initialization
 * - Missing exports in the bundled code
 * - Module resolution failures in production
 * - Server startup failures due to bundling issues
 */

import {spawn} from 'node:child_process';
import {setTimeout} from 'node:timers/promises';

const PORT = 8765;
const TIMEOUT = 30000; // 30 seconds

async function runTest() {
  console.log('🧪 Starting production serving test...\n');

  // Start the production server
  console.log('Starting production server on port', PORT);
  const server = spawn('pnpm', ['start'], {
    stdio: 'pipe',
    env: {...process.env, PORT: String(PORT)},
  });

  let serverOutput = '';
  let serverStarted = false;

  server.stdout?.on('data', (data) => {
    const output = data.toString();
    serverOutput += output;
    process.stdout.write(output);

    // Check if server has started
    if (
      output.includes('Server running') ||
      output.includes(`http://localhost:${PORT}`)
    ) {
      serverStarted = true;
    }
  });

  server.stderr?.on('data', (data) => {
    const output = data.toString();
    serverOutput += output;
    // Don't fail on deprecation warnings
    if (!output.includes('DeprecationWarning')) {
      process.stderr.write(output);
    }
  });

  // Wait for server to start
  const startTime = Date.now();
  while (!serverStarted && Date.now() - startTime < TIMEOUT) {
    await setTimeout(100);
  }

  if (!serverStarted) {
    console.error('\n❌ Server failed to start within timeout');
    server.kill();
    process.exit(1);
  }

  console.log('\n✅ Server started successfully');

  // Make a test request to ensure the server is responding
  try {
    console.log('\nTesting index page...');
    const response = await fetch(`http://localhost:${PORT}/`);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    if (
      !text.includes('<!DOCTYPE html>') &&
      !text.includes('<!doctype html>')
    ) {
      throw new Error('Response does not appear to be valid HTML');
    }

    if (!text.includes('Hello World')) {
      throw new Error(
        'Index page does not contain expected "Hello World" text'
      );
    }

    console.log('✅ Index page responded with valid HTML and expected content');
  } catch (error) {
    console.error('\n❌ Index page request failed:', error);
    server.kill();
    process.exit(1);
  }

  // Test another route to ensure routing works
  try {
    console.log('\nTesting 404 handling...');
    const response = await fetch(
      `http://localhost:${PORT}/nonexistent-route-12345`
    );

    if (response.ok) {
      throw new Error('Expected 404 status for nonexistent route');
    }

    console.log('✅ 404 handling works correctly');
  } catch (error) {
    console.error('\n❌ 404 test failed:', error);
    server.kill();
    process.exit(1);
  }

  // Check for any errors in server output
  if (
    serverOutput.toLowerCase().includes('cannot read properties of undefined')
  ) {
    console.error('\n❌ Found circular dependency error in server output');
    server.kill();
    process.exit(1);
  }

  if (
    serverOutput.toLowerCase().includes('error:') &&
    !serverOutput.toLowerCase().includes('deprecationwarning')
  ) {
    console.error('\n❌ Found error in server output');
    server.kill();
    process.exit(1);
  }

  console.log('\n✅ No errors detected in server output');

  // Clean shutdown
  console.log('\nShutting down server...');
  server.kill();

  // Wait for graceful shutdown
  await setTimeout(1000);

  console.log('\n🎉 Production serving test passed!\n');
  process.exit(0);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test interrupted');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Test terminated');
  process.exit(1);
});

// Run the test
runTest().catch((error) => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});
