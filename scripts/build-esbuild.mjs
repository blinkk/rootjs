import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile, rm} from 'node:fs/promises';
import path from 'node:path';

const [configPathArg, ...args] = process.argv.slice(2);
const watch = args.includes('--watch');

if (!configPathArg) {
  console.error('Missing esbuild config path.');
  process.exit(1);
}

const configPath = path.resolve(process.cwd(), configPathArg);
const packageDir = path.dirname(configPath);
const config = JSON.parse(await readFile(configPath, 'utf-8'));
const packageRequire = createRequire(path.join(packageDir, 'package.json'));
const esbuild = packageRequire('esbuild');
const outdir = path.join(packageDir, 'dist');

const buildOptions = {
  absWorkingDir: packageDir,
  bundle: true,
  entryPoints: config.entryPoints,
  external: config.external || [],
  format: 'esm',
  outdir,
  packages: 'external',
  platform: 'node',
  sourcemap: config.sourcemap || false,
  splitting: Boolean(config.splitting),
  target: config.target,
  tsconfig: config.tsconfig
    ? path.join(packageDir, config.tsconfig)
    : undefined,
};

if (config.clean !== false) {
  await rm(outdir, {force: true, recursive: true});
}

if (watch) {
  const context = await esbuild.context(buildOptions);
  await context.watch();
  const tsc = startTsc({watch: true});
  console.log(`Watching ${path.relative(process.cwd(), configPath)}.`);
  await waitForExit(context, tsc);
} else {
  await esbuild.build(buildOptions);
  const status = await startTsc({watch: false});
  if (status !== 0) {
    process.exit(status);
  }
}

function startTsc(options) {
  if (!config.dtsProject) {
    return options.watch ? undefined : 0;
  }
  const tscBin = packageRequire.resolve('typescript/bin/tsc');
  const tscArgs = [tscBin, '--project', config.dtsProject];
  if (options.watch) {
    const child = spawn(
      process.execPath,
      [...tscArgs, '--watch', '--preserveWatchOutput'],
      {
        cwd: packageDir,
        stdio: 'inherit',
      }
    );
    child.on('exit', (code) => {
      if (code) {
        process.exit(code);
      }
    });
    return child;
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, tscArgs, {
      cwd: packageDir,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code || 0));
  });
}

async function waitForExit(context, tsc) {
  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await context.dispose();
    tsc?.kill('SIGTERM');
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await new Promise(() => {});
}
