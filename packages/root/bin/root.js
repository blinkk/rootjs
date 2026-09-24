#!/usr/bin/env node

import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import {CliRunner} from '../dist/cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require(path.join(__dirname, '../package.json'));

// dotenv >= 18 logs an "injected env" line by default.
dotenv.config({quiet: true});

require('source-map-support').install();

async function main(argv) {
  const cli = new CliRunner('root.js', packageJson.version);
  await cli.run(argv);
}

main(process.argv);
