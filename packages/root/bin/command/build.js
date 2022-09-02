import {promises as fsPromises} from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath} from 'url';
import fsExtra from 'fs-extra';
import glob from 'tiny-glob';
import {build as viteBuild} from 'vite';
import {pluginRoot} from '../../dist/server/vite-plugin-root.js';
import {BuildAssetMap} from '../../dist/server/asset-map/build-asset-map.js';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');
const version = packageJson.version;

import load from '@proload/core';
import typescript from '@proload/plugin-typescript';
load.use([typescript]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function build() {
  console.log(`🌳 Root.js v${version}`);

  const rootDir = process.cwd();
  const loadedConfig = await load('root', {cwd: rootDir});
  const rootConfig = loadedConfig.value;

  const distDir = path.join(rootDir, 'dist');

  const routes = [];
  const routeFiles = await glob('./routes/**/*');
  routeFiles.forEach((file) => {
    const parts = path.parse(file);
      if (!parts.name.startsWith('_') && isJsFile(parts.base)) {
        routes.push(file);
      }
  });

  const elements = [];
  const elementFiles = await glob('./elements/**/*');
  elementFiles.forEach((file) => {
    const parts = path.parse(file);
      if (isJsFile(parts.base)) {
        elements.push(file);
      }
  });

  const bundleScripts = [];
  const bundleFiles = await glob('./bundles/*');
  bundleFiles.forEach((file) => {
    const parts = path.parse(file);
    if (isJsFile(parts.base)) {
      bundleScripts.push(file);
    }
  });

  const viteConfig = {
    resolve: {
      alias: {
        '@': path.resolve(process.cwd()),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          includePaths: [
            path.resolve(process.cwd(), './styles')
          ],
        },
      },
    },
    plugins: [pluginRoot()],
  };

  // Bundle the render.js file with vite, which is pre-optimized for rendering
  // HTML routes.
  await viteBuild({
    ...viteConfig,
    mode: 'production',
    publicDir: false,
    build: {
      rollupOptions: {
        input: [
          path.resolve(__dirname, '../../dist/server/render.jsx'),
        ],
        output: {
          format: 'esm',
          chunkFileNames: 'chunks/[name].[hash].mjs',
          assetFileNames: 'assets/[name].[hash][extname]',
        },
      },
      outDir: path.join(distDir, 'server'),
      ssr: true,
      ssrManifest: false,
      cssCodeSplit: true,
      target: 'esnext',
      minify: false,
      polyfillModulePreload: false,
      reportCompressedSize: false,
    }
  });

  // Pre-render any client scripts and CSS deps.
  await viteBuild({
    ...viteConfig,
    mode: 'production',
    publicDir: false,
    build: {
      rollupOptions: {
        input: [...routes, ...elements, ...bundleScripts],
        output: {
          format: 'esm',
          chunkFileNames: 'chunks/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash][extname]',
        },
      },
      outDir: path.join(distDir, 'client'),
      ssr: false,
      ssrManifest: false,
      manifest: true,
      cssCodeSplit: true,
      target: 'esnext',
      minify: true,
      polyfillModulePreload: false,
      reportCompressedSize: false,
    }
  });

  const manifest = await loadJson(path.join(distDir, 'client/manifest.json'));

  // Use the output of the client build to generate an asset map, which is used
  // by the renderer for automatically injecting dependencies for a page.
  const assetMap = new BuildAssetMap(manifest);

  // Save the asset map to `dist/client` for use by the prod SSR server.
  writeFile(
    path.join(distDir, 'client/root-manifest.json'),
    JSON.stringify(assetMap.toJson(), null, 2)
  );

  // Write SSG output to `dist/html`.
  const buildDir = path.join(distDir, 'html');

  // Recursively copy files from `public` to `dist/html`.
  const publicDir = path.join(rootDir, 'public');
  if (fsExtra.existsSync(path.join(rootDir, 'public'))) {
    fsExtra.copySync(publicDir, buildDir);
  } else {
    makeDir(buildDir);
  }

  // Copy files from `dist/client/{assets,chunks}` to `dist/html`.
  copyDir(path.join(distDir, 'client/assets'), path.join(buildDir, 'assets'));
  copyDir(path.join(distDir, 'client/chunks'), path.join(buildDir, 'chunks'));

  // Render HTML pages.
  const {render, getRouter} = await import(path.join(distDir, 'server/render.js'));
  const router = getRouter(rootConfig);
  const promises = [];
  router.walk((routePath, route) => {
    const promise = new Promise(async (resolve, reject) => {
      const urls = [];
      if (route.getStaticPaths) {
        const staticPaths = await route.getStaticPaths();
        if (!staticPaths) {
          return;
        }
        const routeParams = staticPaths.paths || [];
        routeParams.forEach((routeParam) => {
          urls.push(replaceParams(routePath, routeParam.params));
        });
      } else {
        urls.push(routePath);
      }
      for (const url of urls) {
        const data = await render(url, {config: rootConfig, assetMap});
        let outPath = path.join(distDir, `html${url}`, 'index.html');
        if (outPath.endsWith('404/index.html')) {
          outPath = outPath.replace('404/index.html', '404.html');
        }
        await writeFile(outPath, data.html);
        console.log(`saved ${outPath}`);
      }
      resolve();
    });
    promises.push(promise);
  });
  await Promise.all(promises);
}

function isJsFile(file) {
  return !!file.match(/\.(j|t)sx?$/);
}

async function writeFile(filePath, content) {
  const dirPath = path.dirname(filePath);
  await makeDir(dirPath);
  await fsPromises.writeFile(filePath, content);
}

async function makeDir(dirPath) {
  try {
    await fsPromises.access(dirPath);
  } catch (e) {
    await fsPromises.mkdir(dirPath, {recursive: true});
  }
}

async function copyDir(srcDir, dstDir) {
  if (!fsExtra.existsSync(srcDir)) {
    return;
  }
  fsExtra.copySync(srcDir, dstDir, {recursive: true, overwrite: true});
}

async function loadJson(filePath) {
  const content = await fsPromises.readFile(filePath);
  return JSON.parse(content);
}

function replaceParams(urlPath, params) {
  for (const key of Object.keys(params)) {
    const val = params[key];
    urlPath = urlPath.replace(`[${key}]`, val).replace(`[...${key}]`, val);
  }
  return urlPath;
}
