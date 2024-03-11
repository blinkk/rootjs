#!/usr/bin/env node

import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import {bgGreen, black} from 'kleur/colors';
import {initFirebase, generateTypes} from '../dist/cli.js';
import {loadRootConfig} from '@blinkk/root/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require(path.join(__dirname, '../package.json'));

async function main() {
  console.log(`🥕 ${bgGreen(black(' root-cms '))} v${packageJson.version}`);

  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});

  const program = new Command('root-cms');
  program.version(packageJson.version);
  program
    .command('init-firebase')
    .description('inits the firebase project with proper security rules')
    .option('--project <project>', 'gcp project id')
    .action(initFirebase(rootConfig));
  program
    .command('generate-types')
    .description('generates root-cms.d.ts from *.schema.ts files in the project')
    .action(generateTypes(rootConfig));
  await program.parseAsync(process.argv);
}

main();
