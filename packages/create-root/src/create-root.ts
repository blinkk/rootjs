#!/usr/bin/env node

import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import degit from 'degit';
import {bgGreen, black} from 'kleur/colors';
import {dim} from 'kleur/colors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require(path.join(__dirname, '../package.json'));

const ROOT_VERSION = packageJson.version;

async function main() {
  console.log(`🌱 ${bgGreen(black(' root.js '))} v${ROOT_VERSION}`);
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
    console.log();
    console.log(`${dim('┃')} github path: ${githubPath}`);
    console.log(`${dim('┃')} output dir:  ${maybeRelativePath(outputDir)}`);
    console.log();

    const emitter = degit(githubPath, {
      cache: false,
      force: true,
      verbose: false,
    });
    await emitter.clone(outputDir);
    await updatePackageJson(path.join(outputDir, 'package.json'));
    console.log('done!');
    console.log('next: run `yarn install`');
  });
  await program.parseAsync(process.argv);
}

async function updatePackageJson(packageJsonPath: string) {
  const str = await fs.promises.readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(str);
  packageJson.name = path.basename(path.dirname(packageJsonPath));
  packageJson.version = '1.0.0';
  updateWorkspaceDeps(packageJson.dependencies);
  updateWorkspaceDeps(packageJson.peerDependencies);
  await fs.promises.writeFile(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2),
    'utf-8'
  );
}

/**
 * Updates any `"workspace:*"` values to ROOT_VERSION.
 */
function updateWorkspaceDeps(deps?: Record<string, string> | null) {
  if (!deps) {
    return;
  }
  for (const key in deps) {
    if (deps[key] === 'workspace:*') {
      deps[key] = `^${ROOT_VERSION}`;
    }
  }
}

function maybeRelativePath(filePath: string): string {
  const cwd = process.cwd();
  const fullPath = path.resolve(filePath);

  if (fullPath.startsWith(cwd)) {
    return `./${path.relative(cwd, fullPath)}`;
  }
  return fullPath;
}

main();
