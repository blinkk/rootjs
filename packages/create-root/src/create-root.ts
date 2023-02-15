#!/usr/bin/env node

import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import degit from 'degit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require(path.join(__dirname, '../package.json'));

async function main() {
  const program = new Command('create-root');
  program.version(packageJson.version);
  program.argument('[dir]', 'output dir');
  program.option('--template [template]', 'template to use', 'starter');
  program.option(
    '--repo [repo]',
    'github repo to pull from',
    'blinkk/rootjs/examples'
  );
  program.action(async (dir, options) => {
    if (!dir) {
      dir = process.cwd();
    }
    const outputDir = path.resolve(dir || '.');
    const repo = options.repo || 'blinkk/rootjs/examples';
    const template = options.template || 'starter';
    const githubPath = path.join(repo, template);
    console.log(githubPath);
    console.log(`  github path: ${githubPath}`);
    console.log(`  output dir:  ${maybeRelativePath(outputDir)}`);

    const emitter = degit(githubPath, {
      cache: false,
      force: true,
      verbose: false,
    });
    await emitter.clone(outputDir);
    await updatePackageJson(path.join(outputDir, 'package.json'));
    console.log('done!');
  });
  await program.parseAsync(process.argv);
}

async function updatePackageJson(packageJsonPath: string) {
  const str = await fs.promises.readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(str);
  packageJson.name = path.basename(path.dirname(packageJsonPath));
  packageJson.dependencies['@blinkk/root'] = '*';
  console.log(packageJson);
}

function maybeRelativePath(filePath) {
  const cwd = process.cwd();
  const fullPath = path.resolve(filePath);

  if (fullPath.startsWith(cwd)) {
    return `./${path.relative(cwd, fullPath)}`;
  }
  return fullPath;
}

main();
