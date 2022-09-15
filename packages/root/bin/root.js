#!/usr/bin/env node

import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import {build, dev, start} from '../dist/cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require(path.join(__dirname, '../package.json'));

const program = new Command('root');
program.version(packageJson.version);

program
  .command('build [path]')
  .description('generates a static build')
  .action(build);
program
  .command('dev [path]')
  .description('starts the server in development mode')
  .action(dev);
program
  .command('start [path]')
  .description('starts the server in production mode')
  .action(start);

program.parse(process.argv);
