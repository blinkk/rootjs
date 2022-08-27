#!/usr/bin/env node

import {Command} from 'commander';
import build from './command/build.js';
import dev from './command/dev.js';

const program = new Command();
program.version(process.env.npm_package_version);

program.command('build').description('generates a static build').action(build);
program.command('dev').description('starts the dev server').action(dev);

program.parse(process.argv);
