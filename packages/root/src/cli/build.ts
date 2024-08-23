/* eslint-disable no-control-regex */
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import fsExtra from 'fs-extra';
import {dim, cyan} from 'kleur/colors';
import glob from 'tiny-glob';
import {build as viteBuild, Manifest, ManifestChunk, UserConfig} from 'vite';

import {getVitePlugins} from '../core/plugin.js';
import {Route} from '../core/types.js';
import {getElements} from '../node/element-graph.js';
import {bundleRootConfig, loadRootConfig} from '../node/load-config.js';
import {BuildAssetMap} from '../render/asset-map/build-asset-map.js';
import {htmlMinify} from '../render/html-minify.js';
import {htmlPretty} from '../render/html-pretty.js';
import {batchAsyncCalls} from '../utils/batch.js';
import {
  copyGlob,
  fileExists,
  isDirectory,
  isJsFile,
  loadJson,
  makeDir,
  rmDir,
  writeFile,
} from '../utils/fsutils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type RenderModule = typeof import('../render/render.js');

interface BuildOptions {
  ssrOnly?: boolean;
  mode?: string;
  concurrency?: string | number;
}

export async function build(rootProjectDir?: string, options?: BuildOptions) {
  const mode = options?.mode || 'production';
  process.env.NODE_ENV = mode;

  const rootDir = path.resolve(rootProjectDir || process.cwd());
  const rootConfig = await loadRootConfig(rootDir, {command: 'build'});
  const distDir = path.join(rootDir, 'dist');
  const ssrOnly = options?.ssrOnly || false;

  console.log();
  console.log(`${dim('┃')} project:  ${rootDir}`);
  console.log(`${dim('┃')} output:   ${distDir}/html`);
  console.log(`${dim('┃')} mode:     ${mode}`);
  console.log();

  await rmDir(distDir);
  await makeDir(distDir);

  const routeFiles: string[] = [];
  if (await isDirectory(path.join(rootDir, 'routes'))) {
    const pageFiles = await glob('routes/**/*', {cwd: rootDir});
    pageFiles.forEach((file) => {
      const parts = path.parse(file);
      if (!parts.name.startsWith('_') && isJsFile(parts.base)) {
        routeFiles.push(path.resolve(rootDir, file));
      }
    });
  }

  const elementGraph = await getElements(rootConfig);
  const elements = Object.values(elementGraph.sourceFiles).map((sourceFile) => {
    return sourceFile.filePath;
  });

  const bundleScripts: string[] = [];
  if (await isDirectory(path.join(rootDir, 'bundles'))) {
    const bundleFiles = await glob('bundles/*', {cwd: rootDir});
    bundleFiles.forEach((file) => {
      const parts = path.parse(file);
      if (isJsFile(parts.base)) {
        bundleScripts.push(path.resolve(rootDir, file));
      }
    });
  }

  const rootPlugins = rootConfig.plugins || [];

  // Run any "startup" hooks.
  for (const plugin of rootPlugins) {
    if (typeof plugin.hooks?.startup === 'function') {
      await plugin.hooks.startup({command: 'build', rootConfig});
    }
  }

  const viteConfig = rootConfig.vite || {};
  const vitePlugins = [
    ...(viteConfig.plugins || []),
    ...getVitePlugins(rootPlugins),
  ];

  const baseConfig: UserConfig = {
    ...viteConfig,
    root: rootDir,
    mode: mode,
    esbuild: {
      ...viteConfig.esbuild,
      jsx: 'automatic',
      jsxImportSource: 'preact',
      treeShaking: true,
    },
    plugins: vitePlugins,
  };

  // Bundle the render.js file with vite along with any plugins `ssrInput()`
  // config values. These inputs are bundled through vite and support things
  // like `input.meta.glob()`.
  const ssrInput = {
    render: path.resolve(__dirname, './render.js'),
  };
  rootPlugins.forEach((plugin) => {
    if (plugin.ssrInput) {
      Object.assign(ssrInput, plugin.ssrInput());
    }
  });
  const noExternalConfig = viteConfig.ssr?.noExternal;
  const noExternal: Array<string | RegExp> = [];
  if (noExternalConfig) {
    if (Array.isArray(noExternalConfig)) {
      noExternal.push(...noExternalConfig);
    } else {
      noExternal.push(noExternalConfig as string | RegExp);
    }
  }
  await viteBuild({
    ...baseConfig,
    publicDir: false,
    build: {
      ...viteConfig?.build,
      rollupOptions: {
        ...viteConfig?.build?.rollupOptions,
        input: ssrInput,
        output: {
          format: 'esm',
          chunkFileNames: 'chunks/[hash].min.js',
          assetFileNames: 'assets/[hash][extname]',
          sanitizeFileName: sanitizeFileName,
        },
      },
      outDir: path.join(distDir, 'server'),
      ssr: true,
      ssrManifest: false,
      cssCodeSplit: true,
      target: 'esnext',
      minify: false,
      modulePreload: {polyfill: false},
      reportCompressedSize: false,
      sourcemap: 'inline',
    },
    ssr: {
      ...viteConfig.ssr,
      target: 'node',
      noExternal: ['@blinkk/root', '@blinkk/root-cms/richtext', ...noExternal],
    },
  });

  // Pre-render CSS deps from /routes/.
  await viteBuild({
    ...baseConfig,
    publicDir: false,
    build: {
      ...viteConfig?.build,
      rollupOptions: {
        ...viteConfig?.build?.rollupOptions,
        input: [...routeFiles],
        output: {
          format: 'esm',
          entryFileNames: 'assets/[hash].min.js',
          assetFileNames: 'assets/[hash][extname]',
          chunkFileNames: 'chunks/[hash].min.js',
          sanitizeFileName: sanitizeFileName,
          ...viteConfig?.build?.rollupOptions?.output,
        },
      },
      outDir: path.join(distDir, '.build/routes'),
      ssr: true,
      ssrManifest: false,
      ssrEmitAssets: true,
      manifest: true,
      cssCodeSplit: true,
      target: 'esnext',
      minify: true,
      modulePreload: {polyfill: false},
      reportCompressedSize: false,
    },
  });

  // Pre-render /elements/ and /bundles/.
  const clientInput = [...elements, ...bundleScripts];
  if (clientInput.length > 0) {
    await viteBuild({
      ...baseConfig,
      publicDir: false,
      build: {
        ...viteConfig?.build,
        rollupOptions: {
          ...viteConfig?.build?.rollupOptions,
          input: [...elements, ...bundleScripts],
          output: {
            format: 'esm',
            entryFileNames: 'assets/[hash].min.js',
            assetFileNames: 'assets/[hash][extname]',
            chunkFileNames: 'chunks/[hash].min.js',
            sanitizeFileName: sanitizeFileName,
            ...viteConfig?.build?.rollupOptions?.output,
          },
        },
        outDir: path.join(distDir, '.build/client'),
        ssr: false,
        ssrManifest: false,
        manifest: true,
        cssCodeSplit: true,
        target: 'esnext',
        minify: true,
        modulePreload: {polyfill: false},
        reportCompressedSize: false,
      },
    });
  } else {
    await writeFile(
      path.join(distDir, '.build/client/.vite/manifest.json'),
      '{}'
    );
  }

  // Bundle the root.config.ts file to dist/root.config.js.
  await bundleRootConfig(rootDir, path.join(distDir, 'root.config.js'));

  // Copy CSS files from `dist/.build/routes/**/*.css` to
  // `dist/.build/client/` and flatten the routes manifest to ignore any
  // imported modules. Then add the route assets to the client manifest.
  await copyGlob(
    '**/*.css',
    path.join(distDir, '.build/routes'),
    path.join(distDir, '.build/client')
  );
  const routesManifest = await loadJson<Manifest>(
    path.join(distDir, '.build/routes/.vite/manifest.json')
  );
  const clientManifest = await loadJson<Manifest>(
    path.join(distDir, '.build/client/.vite/manifest.json')
  );
  function collectRouteCss(
    asset: ManifestChunk,
    cssDeps: Set<string>,
    visited: Set<string>
  ) {
    if (!asset || !asset.file || visited.has(asset.file)) {
      return;
    }
    visited.add(asset.file);
    if (asset.css) {
      asset.css.forEach((dep) => cssDeps.add(dep));
    }
    if (asset.imports) {
      asset.imports.forEach((manifestKey) => {
        collectRouteCss(routesManifest[manifestKey], cssDeps, visited);
      });
    }
  }
  Object.keys(routesManifest).forEach((manifestKey) => {
    const asset = routesManifest[manifestKey];
    if (asset.isEntry) {
      const visited = new Set<string>();
      const cssDeps = new Set<string>();
      collectRouteCss(asset, cssDeps, visited);
      asset.css = Array.from(cssDeps);
      asset.imports = [];
      clientManifest[manifestKey] = asset;
    } else if (asset.file.endsWith('.css')) {
      clientManifest[manifestKey] = asset;
    }
  });

  // Use the output of the client build to generate an asset map, which is used
  // by the renderer for automatically injecting dependencies for a page.
  const assetMap = BuildAssetMap.fromViteManifest(
    rootConfig,
    clientManifest,
    elementGraph
  );

  // Save the root's asset map to `dist/.root/manifest.json` for use by the prod
  // SSR server.
  const rootManifest = assetMap.toJson();
  await writeFile(
    path.join(distDir, '.root/manifest.json'),
    JSON.stringify(rootManifest, null, 2)
  );

  // Save the element graph to `dist/.root/elements.json` for use by the prod
  // SSR server.
  const elementGraphJson = elementGraph.toJson();
  await writeFile(
    path.join(distDir, '.root/elements.json'),
    JSON.stringify(elementGraphJson, null, 2)
  );

  // Write SSG output to `dist/html`.
  const buildDir = path.join(distDir, 'html');

  // Recursively copy files from `public` to `dist/html`.
  const publicDir = path.join(rootDir, 'public');
  if (fsExtra.existsSync(path.join(rootDir, 'public'))) {
    fsExtra.copySync(publicDir, buildDir, {dereference: true});
  } else {
    await makeDir(buildDir);
  }

  const seenAssets = new Set<string>();
  async function copyAssetToDistHtml(assetUrl: string) {
    if (seenAssets.has(assetUrl)) {
      return;
    }
    seenAssets.add(assetUrl);
    const assetRelPath = assetUrl.slice(1);
    const assetFrom = path.join(distDir, '.build/client', assetRelPath);
    const assetTo = path.join(buildDir, assetRelPath);
    // Ignore assets that don't exist. This is because build artifacts from
    // the routes/ folder are not copied to dist/client (only css deps are).
    if (!(await fileExists(assetFrom))) {
      console.log(`${assetFrom} does not exist`);
      return;
    }
    await fsExtra.copy(assetFrom, assetTo);
    printFileOutput(fileSize(assetTo), 'dist/html/', assetRelPath);
  }

  // Copy files from `dist/client/{assets,chunks}` to `dist/html` using the
  // root manifest. Ignore route files.
  console.log('\njs/css output:');
  await Promise.all(
    Object.keys(rootManifest).map(async (src) => {
      const assetData = rootManifest[src];
      // Only imported css from routes files should be included in build output.
      // Don't expose route files in the final output. If any client-side code
      // relies on route dependencies, it should probably be broken out into a
      // shared component instead.
      if (isRouteFile(src)) {
        const importedCss = assetData.importedCss || [];
        for (const cssAssetUrl of importedCss) {
          await copyAssetToDistHtml(cssAssetUrl);
        }
        return;
      }

      // Ignore files with no assetUrl, which can sometimes occur if a source
      // file is empty.
      if (!assetData.assetUrl) {
        return;
      }

      // Copy assets and any imported css files.
      await copyAssetToDistHtml(assetData.assetUrl);
      const importedCss = assetData.importedCss || [];
      for (const cssAssetUrl of importedCss) {
        await copyAssetToDistHtml(cssAssetUrl);
      }
    })
  );

  // Pre-render HTML pages (SSG).
  if (!ssrOnly) {
    const render: RenderModule = await import(
      path.join(distDir, 'server/render.js')
    );
    const renderer = new render.Renderer(rootConfig, {assetMap, elementGraph});
    const sitemap = await renderer.getSitemap();

    const sitemapXmlItems: Array<{
      url: string;
      locale: string;
      alts: Array<{locale: string; hreflang: string; url: string}>;
    }> = [];
    if (rootConfig.sitemap && !rootConfig.domain) {
      throw new Error(
        'missing "domain" in root.config.ts, required when using {sitemap: true}'
      );
    }
    const domain = rootConfig.domain!;

    console.log('\nhtml output:');
    const batchSize = Number(options?.concurrency || 10);
    await batchAsyncCalls(Object.keys(sitemap), batchSize, async (urlPath) => {
      const sitemapItem = sitemap[urlPath];
      try {
        const data = await renderer.renderRoute(sitemapItem.route, {
          routeParams: sitemapItem.params,
        });
        if (data.notFound) {
          return;
        }

        // The renderer currently assumes that all paths serve HTML.
        // TODO(stevenle): support non-HTML routes using `routes/[name].[ext].ts`.
        let outFilePath = path.join(urlPath.slice(1), 'index.html');
        if (outFilePath.endsWith('404/index.html')) {
          outFilePath = outFilePath.replace('404/index.html', '404.html');
        }
        const outPath = path.join(buildDir, outFilePath);

        // Save the url to sitemap.xml. Ignore error files (e.g. 404.html).
        if (rootConfig.sitemap && outFilePath.endsWith('index.html')) {
          const sitemapXmlItem: {
            url: string;
            locale: string;
            alts: Array<{locale: string; hreflang: string; url: string}>;
          } = {
            url: `${domain}${urlPath}`,
            locale: sitemapItem.locale,
            alts: [],
          };
          sitemapXmlItems.push(sitemapXmlItem);
          if (sitemapItem.alts) {
            Object.entries(sitemapItem.alts).forEach(([altLocale, item]) => {
              sitemapXmlItem.alts.push({
                url: `${domain}${item.urlPath}`,
                locale: altLocale,
                hreflang: item.hrefLang,
              });
            });
          }
        }

        // Render html and save the file to dist/html.
        let html = data.html || '';
        if (rootConfig.prettyHtml !== false) {
          html = await htmlPretty(html, rootConfig.prettyHtmlOptions);
        }
        // HTML minification is `true` by default. Set to `false` to disable.
        if (rootConfig.minifyHtml !== false) {
          html = await htmlMinify(html, rootConfig.minifyHtmlOptions);
        }
        await writeFile(outPath, html);

        printFileOutput(fileSize(outPath), 'dist/html/', outFilePath);
      } catch (e) {
        logBuildError(
          {route: sitemapItem.route, params: sitemapItem.params, urlPath},
          e
        );
        throw new Error(
          `BuildError: ${urlPath} (${sitemapItem.route.src}) failed to build.`
        );
      }
    });

    // Generate sitemap.xml.
    if (rootConfig.sitemap) {
      const sitemapXmlBuilder: string[] = [];
      sitemapXmlItems.sort((a, b) => a.url.localeCompare(b.url));
      sitemapXmlItems.forEach((item) => {
        sitemapXmlBuilder.push('<url>');
        sitemapXmlBuilder.push(`  <loc>${item.url}</loc>`);
        if (item.alts.length > 0) {
          item.alts.sort((a, b) => a.hreflang.localeCompare(b.hreflang));
          item.alts.forEach((alt) => {
            if (item.locale !== alt.locale) {
              sitemapXmlBuilder.push(
                `  <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${alt.url}" />`
              );
            }
          });
        }
        sitemapXmlBuilder.push('</url>');
      });

      const sitemapXmlLines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">',
        ...sitemapXmlBuilder,
        '</urlset>',
      ];
      const sitemapXml = sitemapXmlLines.join('\n');
      const outPath = path.join(buildDir, 'sitemap.xml');
      await writeFile(outPath, sitemapXml);
      printFileOutput(fileSize(outPath), 'dist/html/', 'sitemap.xml');
    }
  }
}

function isRouteFile(filepath: string) {
  return filepath.startsWith('routes') && isJsFile(filepath);
}

function fileSize(filepath: string) {
  const stats = fsExtra.statSync(filepath);
  const bytes = stats.size;

  const k = 1024;
  if (bytes < k) {
    return (bytes / k).toFixed(2) + ' kB';
  }
  const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

function printFileOutput(
  fileSize: string,
  outputDir: string,
  outputFile: string
) {
  const indent = ' '.repeat(2);
  const paddedSize = fileSize.padStart(9, ' ');
  console.log(
    `${indent}${dim(paddedSize)}  ${dim(outputDir)}${cyan(outputFile)}`
  );
}

function sanitizeFileName(name: string): string {
  return (
    name
      // Remove placeholder vars from paths like routes/[...var].tsx.
      .replaceAll('...', '')
      .replaceAll('_', '')
      .replaceAll('[', '')
      .replaceAll(']', '')
      // Remove non-ascii chars and null bytes.
      .replace(/[^\x00-\x7F]/g, '')
      .replace(/\x00/g, '')
      .toLowerCase()
  );
}

interface BuildContext {
  route: Route;
  params: Record<string, string>;
  urlPath: string;
}

function logBuildError(ctx: BuildContext, e: Error) {
  const {route, params, urlPath} = ctx;
  const errorString = String(e.stack || e);
  console.error();
  if (Object.keys(params).length > 0) {
    console.error(
      `An error occurred building ${urlPath} (${route.src}) with params:
${formatParams(params)}

The error was:
  ${errorString}
  `.trim()
    );
  } else {
    console.error(
      `An error occurred building ${urlPath} (${route.src})

The error was:
  ${errorString}`
    );
  }
}

function formatParams(params: Record<string, string>) {
  return Object.entries(params)
    .map(([key, value]) => {
      return `  ${key}: ${value}`;
    })
    .join('\n');
}
