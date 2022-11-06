import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fsExtra from 'fs-extra';
import glob from 'tiny-glob';
import {build as viteBuild, Manifest, UserConfig} from 'vite';
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
import {dim} from 'kleur/colors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type RenderModule = typeof import('../../render/render.js');

interface BuildOptions {
  ssrOnly?: boolean;
  mode?: string;
}

export async function build(rootProjectDir?: string, options?: BuildOptions) {
  const rootDir = path.resolve(rootProjectDir || process.cwd());
  const rootConfig = await loadRootConfig(rootDir);
  const distDir = path.join(rootDir, 'dist');
  const ssrOnly = options?.ssrOnly || false;
  const mode = options?.mode || 'production';

  console.log();
  console.log(`${dim('┃')} project:  ${rootDir}`);
  console.log(`${dim('┃')} output:   ${distDir}/html`);
  console.log(`${dim('┃')} mode:     ${mode}`);
  console.log();

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

  const elementsDirs = [path.join(rootDir, 'elements')];
  const elementsInclude = rootConfig.elements?.include || [];
  const excludePatterns = rootConfig.elements?.exclude || [];
  const excludeElement = (moduleId: string) => {
    return excludePatterns.some((pattern) => Boolean(moduleId.match(pattern)));
  };

  for (const dirPath of elementsInclude) {
    const elementsDir = path.resolve(rootDir, dirPath);
    if (!elementsDir.startsWith(rootDir)) {
      throw new Error(
        `the elements dir (${dirPath}) should be relative to the project's root dir (${rootDir})`
      );
    }
    elementsDirs.push(elementsDir);
  }
  const elements: string[] = [];
  const elementMap: Record<string, string> = {};
  for (const dirPath of elementsDirs) {
    if (await isDirectory(dirPath)) {
      const elementFiles = await glob('**/*', {cwd: dirPath});
      elementFiles.forEach((file) => {
        const parts = path.parse(file);
        if (isJsFile(parts.base)) {
          const fullPath = path.join(dirPath, file);
          const moduleId = fullPath.slice(rootDir.length);
          if (!excludeElement(moduleId)) {
            elements.push(fullPath);
            elementMap[parts.name] = moduleId;
          }
        }
      });
    }
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
  const baseConfig: UserConfig = {
    ...viteConfig,
    root: rootDir,
    mode: mode,
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'preact',
      treeShaking: true,
    },
    plugins: [...(viteConfig.plugins || []), pluginRoot({rootDir, rootConfig})],
  };

  // Bundle the render.js file with vite, which is pre-optimized for rendering
  // HTML routes.
  await viteBuild({
    ...baseConfig,
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
    ssr: {
      noExternal: ['@blinkk/root'],
    },
  });

  // Pre-render any client scripts and CSS deps.
  await viteBuild({
    ...baseConfig,
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

  const viteManifest = await loadJson<Manifest>(
    path.join(distDir, 'client/manifest.json')
  );

  // Use the output of the client build to generate an asset map, which is used
  // by the renderer for automatically injecting dependencies for a page.
  const assetMap = BuildAssetMap.fromViteManifest(viteManifest, elementMap);

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

  // Pre-render HTML pages (SSG).
  if (!ssrOnly) {
    const render: RenderModule = await import(
      path.join(distDir, 'server/render.js')
    );
    const renderer = new render.Renderer(rootConfig, {assetMap});
    const sitemap = await renderer.getSitemap();

    await Promise.all(
      Object.keys(sitemap).map(async (urlPath) => {
        const {route, params} = sitemap[urlPath];
        const data = await renderer.renderRoute(route, {
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
}
