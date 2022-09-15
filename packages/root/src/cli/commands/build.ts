import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fsExtra from 'fs-extra';
import glob from 'tiny-glob';
import {build as viteBuild} from 'vite';
import {pluginRoot} from '../../render/vite-plugin-root.js';
import {BuildAssetMap} from '../../render/asset-map/build-asset-map.js';
import {loadRootConfig} from '../load-config.js';
import {
  copyDir,
  isDirectory,
  isJsFile,
  loadJson,
  makeDir,
  rmDir,
  writeFile,
} from '../../core/fsutils.js';
import {Renderer} from '../../render/render.js';
import {htmlMinify} from '../../render/html-minify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function build(rootDir?: string) {
  console.log('🌳 Root.js');

  if (!rootDir) {
    rootDir = process.cwd();
  }
  const rootConfig = await loadRootConfig(rootDir);
  const distDir = path.join(rootDir, 'dist');
  await rmDir(distDir);
  await makeDir(distDir);

  const pages: string[] = [];
  if (await isDirectory(path.join(rootDir, 'routes'))) {
    const pageFiles = await glob(path.join(rootDir, 'routes/**/*'));
    pageFiles.forEach((file) => {
      const parts = path.parse(file);
      if (!parts.name.startsWith('_') && isJsFile(parts.base)) {
        pages.push(file);
      }
    });
  }

  const elements: string[] = [];
  if (await isDirectory(path.join(rootDir, 'elements'))) {
    const elementFiles = await glob(path.join(rootDir, 'elements/**/*'));
    elementFiles.forEach((file) => {
      const parts = path.parse(file);
      if (isJsFile(parts.base)) {
        elements.push(file);
      }
    });
  }

  const bundleScripts: string[] = [];
  if (await isDirectory(path.join(rootDir, 'bundles'))) {
    const bundleFiles = await glob(path.join(rootDir, 'bundles/*'));
    bundleFiles.forEach((file) => {
      const parts = path.parse(file);
      if (isJsFile(parts.base)) {
        bundleScripts.push(file);
      }
    });
  }

  const viteConfig = rootConfig.vite || {};
  const baseConfig = {
    ...viteConfig,
    root: rootDir,
    esbuild: {
      jsxFactory: 'h',
      jsxFragment: 'Fragment',
      jsxInject: 'import {h, Fragment} from "preact";',
    },
    plugins: [...(viteConfig.plugins || []), pluginRoot()],
  };

  // Bundle the render.js file with vite, which is pre-optimized for rendering
  // HTML routes.
  await viteBuild({
    ...baseConfig,
    mode: 'production',
    publicDir: false,
    build: {
      rollupOptions: {
        input: [path.resolve(__dirname, './render.js')],
        output: {
          format: 'esm',
          chunkFileNames: 'chunks/[name].[hash].js',
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
    },
  });

  // Pre-render any client scripts and CSS deps.
  await viteBuild({
    ...baseConfig,
    mode: 'production',
    publicDir: false,
    build: {
      rollupOptions: {
        input: [...pages, ...elements, ...bundleScripts],
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
    },
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
  const render = await import(path.join(distDir, 'server/render.js'));
  const renderer = new render.Renderer(rootConfig) as Renderer;
  const sitemap = await renderer.getSitemap();

  await Promise.all(
    Object.keys(sitemap).map(async (urlPath) => {
      const {route, params} = sitemap[urlPath];
      const data = await renderer.renderRoute(route, {
        assetMap,
        routeParams: params,
      });

      // The renderer currently assumes that all paths serve HTML.
      // TODO(stevenle): support non-HTML routes using `routes/[name].[ext].ts`.
      let outPath = path.join(distDir, `html${urlPath}`, 'index.html');

      if (outPath.endsWith('404/index.html')) {
        outPath = outPath.replace('404/index.html', '404.html');
      }

      const html = await htmlMinify(data.html || '');
      await writeFile(outPath, html);

      const relPath = outPath.slice(path.dirname(distDir).length + 1);
      console.log(`saved ${relPath}`);
    })
  );
}
