#!/usr/bin/env node

import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import {bgGreen, black} from 'kleur/colors';
import {generateHash} from '../dist/cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require(path.join(__dirname, '../package.json'));

async function main() {
  console.log(`🥕 ${bgGreen(black(' root-password-protect'))} v${packageJson.version}`);

  const program = new Command('root-password-protect');
  program.version(packageJson.version);
  program
    .command('generate-hash <password>')
    .description('generates root-cms.d.ts from *.schema.ts files in the project')
    .action(generateHash);
  await program.parseAsync(process.argv);
}

main();
