import {spawn, type ChildProcess} from 'node:child_process';
import {readFile, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';

/** The per-package `esbuild.config.json` format. */
interface EsbuildConfig {
  /** Whether to delete `dist/` before building. Defaults to `true`. */
  clean?: boolean;
  /** tsconfig used to emit `.d.ts` files with `tsc`, if any. */
  dtsProject?: string;
  entryPoints: string[] | Record<string, string>;
  external?: string[];
  sourcemap?: boolean;
  splitting?: boolean;
  target: string;
  tsconfig?: string;
}

/** The subset of esbuild's `BuildContext` API used by this script. */
interface EsbuildContext {
  watch(): Promise<void>;
  dispose(): Promise<void>;
}

const [configPathArg, ...args] = process.argv.slice(2);
const watch = args.includes('--watch');

if (!configPathArg) {
  console.error('Missing esbuild config path.');
  process.exit(1);
}

const configPath = path.resolve(process.cwd(), configPathArg);
const packageDir = path.dirname(configPath);
const config: EsbuildConfig = JSON.parse(await readFile(configPath, 'utf-8'));
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
  const context: EsbuildContext = await esbuild.context(buildOptions);
  await context.watch();
  const tsc = watchTsc();
  console.log(`Watching ${path.relative(process.cwd(), configPath)}.`);
  await waitForExit(context, tsc);
} else {
  await esbuild.build(buildOptions);
  const status = await runTsc();
  if (status !== 0) {
    process.exit(status);
  }
}

/** Returns the args to run `tsc` for the `dtsProject`, if one is configured. */
function getTscArgs(): string[] | undefined {
  if (!config.dtsProject) {
    return undefined;
  }
  // Resolve tsc via the package root instead of `typescript/bin/tsc` directly:
  // TypeScript 7 no longer lists `./bin/tsc` in its package `exports`, so the
  // subpath can't be resolved. `typescript/package.json` is always exported.
  const tscPkg = packageRequire.resolve('typescript/package.json');
  const tscBin = path.join(path.dirname(tscPkg), 'bin', 'tsc');
  return [tscBin, '--project', config.dtsProject];
}

/** Runs `tsc` once and resolves with its exit code. */
function runTsc(): Promise<number> {
  const tscArgs = getTscArgs();
  if (!tscArgs) {
    return Promise.resolve(0);
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, tscArgs, {
      cwd: packageDir,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code || 0));
  });
}

/** Starts `tsc --watch`, exiting this process if `tsc` fails. */
function watchTsc(): ChildProcess | undefined {
  const tscArgs = getTscArgs();
  if (!tscArgs) {
    return undefined;
  }
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

async function waitForExit(
  context: EsbuildContext,
  tsc: ChildProcess | undefined
) {
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
