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
    .action(build);
  program
    .command('dev [path]')
    .description('starts the server in development mode')
    .action(dev);
  program
    .command('preview [path]')
    .description('starts the server in preview mode')
    .action(preview);
  program
    .command('start [path]')
    .description('starts the server in production mode')
    .action(start);
  await program.parseAsync(process.argv);
}

main();
