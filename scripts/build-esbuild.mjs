import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const configs = {
  '@blinkk/create-root': {
    packageDir: 'packages/create-root',
    entryPoints: {
      'create-root': 'src/create-root.ts',
    },
    target: 'node22',
  },
  '@blinkk/root': {
    packageDir: 'packages/root',
    entryPoints: {
      cli: 'src/cli/cli.ts',
      core: 'src/core/core.ts',
      functions: 'src/functions/functions.ts',
      jsx: 'src/jsx/jsx.ts',
      'jsx/jsx-runtime': 'src/jsx/jsx-runtime.ts',
      'jsx/jsx-dev-runtime': 'src/jsx/jsx-dev-runtime.ts',
      middleware: 'src/middleware/middleware.ts',
      node: 'src/node/node.ts',
      render: 'src/render/render.tsx',
    },
    dtsProject: 'tsconfig.build.json',
    external: ['virtual:*'],
    sourcemap: true,
    splitting: true,
    target: 'node22',
    tsconfig: 'tsconfig.json',
  },
  '@blinkk/root-cms': {
    packageDir: 'packages/root-cms',
    clean: false,
    entryPoints: {
      app: 'core/app.tsx',
      cli: 'cli/cli.ts',
      client: 'core/client.ts',
      core: 'core/core.ts',
      functions: 'core/functions.ts',
      plugin: 'core/plugin.ts',
      project: 'core/project.ts',
      richtext: 'core/richtext.tsx',
    },
    dtsProject: 'tsconfig.build.json',
    external: ['virtual:*'],
    splitting: true,
    target: 'node22',
    tsconfig: 'core/tsconfig.json',
  },
  '@blinkk/root-password-protect': {
    packageDir: 'packages/root-password-protect',
    entryPoints: {
      cli: 'src/cli/cli.ts',
      core: 'src/core/core.ts',
      plugin: 'src/plugin/plugin.tsx',
    },
    dtsProject: 'tsconfig.build.json',
    sourcemap: 'inline',
    target: 'node22',
    tsconfig: 'tsconfig.json',
  },
};

const [packageName, ...args] = process.argv.slice(2);
const config = configs[packageName];
const watch = args.includes('--watch');

if (!config) {
  console.error(`Unknown package build target: ${packageName || '(missing)'}`);
  process.exit(1);
}

const packageDir = path.join(repoRoot, config.packageDir);
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
  console.log(`Watching ${packageName} with esbuild.`);
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
