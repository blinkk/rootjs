#!/usr/bin/env node

import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import {build, dev, preview, start} from '../dist/cli.js';
import {bgGreen, black} from 'kleur/colors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require(path.join(__dirname, '../package.json'));

async function main() {
  console.log(`🌱 ${bgGreen(black(' root.js '))} v${packageJson.version}`);

  const program = new Command('root');
  program.version(packageJson.version);
  program
    .command('build [path]')
    .description('generates a static build')
    .option('--ssr-only', 'produce a ssr-only build')
    .option('--mode <mode>', 'see: https://vitejs.dev/guide/env-and-mode.html#modes', 'production')
    .option('-c, --concurrency <num>', 'number of files to build concurrently', 10)
    .action(build);
  program
    .command('dev [path]')
    .description('starts the server in development mode')
    .option('--host <host>', 'network address the server should listen on, e.g. 127.0.0.1')
    .action(dev);
  program
    .command('preview [path]')
    .description('starts the server in preview mode')
    .option('--host <host>', 'network address the server should listen on, e.g. 127.0.0.1')
    .action(preview);
  program
    .command('start [path]')
    .description('starts the server in production mode')
    .option('--host <host>', 'network address the server should listen on, e.g. 127.0.0.1')
    .action(start);
  await program.parseAsync(process.argv);
}

main();
