#!/usr/bin/env node

import {Command} from 'commander';
import {build, dev, start} from '../dist/cli.js';

const program = new Command('root');
program.version(process.env.npm_package_version || 'dev');

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
