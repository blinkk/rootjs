#!/usr/bin/env node

import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import {bgGreen, black} from 'kleur/colors';
import {createServer as createViteServer} from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require(path.join(__dirname, '../package.json'));

async function main() {
  console.log(`🌱 ${bgGreen(black(' root.js cms '))} v${packageJson.version}`);

  // Load cli.js through vite SSR so that things like `import.meta.glob` are
  // handled properly.
  // TODO(stevenle): load the vite config from root.config.ts.
  const viteServer = await createViteServer();
  const cli = await viteServer.ssrLoadModule(
    path.resolve(__dirname, '../dist/cli.js')
  );
  await viteServer.close();

  const program = new Command('root-cms');
  program.version(packageJson.version);
  program
    .command('init-firebase')
    .description('inits the firebase project with proper security rules')
    .action(cli.initFirebase);
  program
    .command('generate-types')
    .description('generates root-cms.d.ts from *.schema.ts in the project')
    .action(cli.generateTypes);
  await program.parseAsync(process.argv);
}

main();
