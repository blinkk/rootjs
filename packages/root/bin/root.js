#!/usr/bin/env node

import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CliRunner} from '../dist/cli.js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require(path.join(__dirname, '../package.json'));

require('source-map-support').install();

async function main(argv) {
  const cli = new CliRunner('root.js', packageJson.version);
  await cli.run(argv);
}

main(process.argv);
