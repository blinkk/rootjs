/**
 * @fileoverview Renders the TSX "scenes" in `screenshots/scenes/` to PNGs.
 *
 * Each scene is a Preact component that recreates a piece of product UI (e.g.
 * the CMS doc editor) with realistic fixture data. The scenes are bundled with
 * esbuild, loaded into headless Chromium via Playwright, and captured at 2x
 * device scale. The PNGs are written to `screenshots/.out/` (gitignored) and
 * are published with `scripts/screenshots_upload.ts`.
 *
 * A scene file looks like:
 *
 * ```tsx
 * // screenshots/scenes/EditorPreview.tsx
 * import type {SceneMeta} from '../types.js';
 *
 * export const meta: SceneMeta = {
 *   id: 'cms-editor-preview',
 *   width: 1440,
 *   height: 900,
 *   alt: 'The Root CMS editor next to a live preview of the page.',
 * };
 *
 * export default function Scene() {
 *   return <div>...</div>;
 * }
 * ```
 *
 * Usage (from the `docs/` dir):
 *
 *   node scripts/screenshots_render.ts
 *   node scripts/screenshots_render.ts --scene cms-editor-preview
 *   node scripts/screenshots_render.ts --scale 1
 *   node scripts/screenshots_render.ts --serve   # print a URL to iterate in a browser
 *
 * Set `CHROMIUM_PATH` to use a specific Chromium binary instead of the one
 * bundled with Playwright.
 */

import {existsSync} from 'node:fs';
import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
import {chromium} from 'playwright';
import type {ManifestEntry, SceneMeta} from '../screenshots/types.ts';
import {hashScreenshotSources} from './screenshots_sources.ts';

const DOCS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const SCREENSHOTS_DIR = path.join(DOCS_DIR, 'screenshots');
const SCENES_DIR = path.join(SCREENSHOTS_DIR, 'scenes');
const OUT_DIR = path.join(SCREENSHOTS_DIR, '.out');
const BUILD_DIR = path.join(OUT_DIR, '_build');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');
const FONTS_CACHE_PATH = path.join(OUT_DIR, '_fonts.css');

/** Fonts used by the scenes, mirroring what the CMS UI uses. */
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';

interface Args {
  scenes: string[];
  scale: number;
  serve: boolean;
}

/** Parses `--scene`, `--scale` and `--serve` flags from argv. */
function parseArgs(argv: string[]): Args {
  const args: Args = {scenes: [], scale: 2, serve: false};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.split('=');
    const nextValue = () => inlineValue ?? argv[++i];
    if (flag === '--scene') {
      args.scenes.push(nextValue());
    } else if (flag === '--scale') {
      const scale = Number(nextValue());
      if (!(scale > 0)) {
        throw new Error(`invalid --scale value: ${arg}`);
      }
      args.scale = scale;
    } else if (flag === '--serve') {
      args.serve = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

/** Lists scene files, ignoring files that start with `_`. */
async function listSceneFiles() {
  const files = await readdir(SCENES_DIR);
  return files
    .filter((f) => f.endsWith('.tsx') && !f.startsWith('_'))
    .sort()
    .map((f) => path.join(SCENES_DIR, f));
}

/**
 * Downloads the web fonts and inlines them as data URIs, so the headless
 * browser renders without network access and the output is deterministic. The
 * result is cached in `.out/_fonts.css`.
 */
async function loadFonts() {
  if (existsSync(FONTS_CACHE_PATH)) {
    return;
  }
  // A modern user agent makes Google Fonts serve woff2 files.
  const headers = {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  };
  const res = await fetch(FONTS_URL, {headers});
  if (!res.ok) {
    throw new Error(`failed to fetch fonts css: ${res.status}`);
  }
  let css = await res.text();
  const urls = Array.from(new Set(css.match(/https:[^)]+\.woff2/g) || []));
  for (const url of urls) {
    const fontRes = await fetch(url, {headers});
    if (!fontRes.ok) {
      throw new Error(`failed to fetch font ${url}: ${fontRes.status}`);
    }
    const data = Buffer.from(await fontRes.arrayBuffer()).toString('base64');
    css = css.replaceAll(url, `data:font/woff2;base64,${data}`);
  }
  await mkdir(OUT_DIR, {recursive: true});
  await writeFile(FONTS_CACHE_PATH, css);
}

/**
 * Bundles every scene into a single browser bundle. The generated entry
 * registers each scene on `window.__SCENES` keyed by its `meta.id`, and
 * renders the scene named in the URL hash.
 */
async function buildBundle(sceneFiles: string[]) {
  const imports = sceneFiles
    .map((file, i) => {
      const rel =
        './' + path.relative(SCREENSHOTS_DIR, file).replace(/\\/g, '/');
      return `import * as scene${i} from ${JSON.stringify(rel)};`;
    })
    .join('\n');
  const list = sceneFiles.map((_, i) => `scene${i}`).join(', ');
  const entry = `
    import {h, render} from 'preact';
    import './.out/_fonts.css';
    ${imports}
    const scenes = {};
    for (const mod of [${list}]) {
      scenes[mod.meta.id] = mod;
    }
    window.__SCENES = Object.fromEntries(
      Object.entries(scenes).map(([id, mod]) => [id, mod.meta])
    );
    async function renderScene() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const root = document.getElementById('root');
      document.body.removeAttribute('data-ready');
      const mod = scenes[id];
      if (!mod) {
        root.innerHTML =
          '<ul class="scene-index">' +
          Object.keys(scenes)
            .map((sid) => '<li><a href="#' + sid + '">' + sid + '</a></li>')
            .join('') +
          '</ul>';
        return;
      }
      document.body.style.width = mod.meta.width + 'px';
      document.body.style.height = mod.meta.height + 'px';
      render(h(mod.default, {}), root);
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.complete ? null : new Promise((r) => (img.onload = img.onerror = r))
        )
      );
      document.body.setAttribute('data-ready', 'true');
    }
    window.addEventListener('hashchange', renderScene);
    renderScene();
  `;

  await rm(BUILD_DIR, {recursive: true, force: true});
  await mkdir(BUILD_DIR, {recursive: true});
  await esbuild.build({
    stdin: {
      contents: entry,
      resolveDir: SCREENSHOTS_DIR,
      sourcefile: 'scenes-entry.tsx',
      loader: 'tsx',
    },
    bundle: true,
    format: 'iife',
    outfile: path.join(BUILD_DIR, 'scenes.js'),
    // Scenes render client-side with Preact rather than the Root.js SSR JSX
    // runtime configured in the docs tsconfig.
    tsconfig: path.join(SCREENSHOTS_DIR, 'tsconfig.json'),
    loader: {'.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl'},
    logLevel: 'warning',
  });

  const hasCss = existsSync(path.join(BUILD_DIR, 'scenes.css'));
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    ${hasCss ? '<link rel="stylesheet" href="scenes.css">' : ''}
    <style>
      html, body { margin: 0; padding: 0; }
      body { overflow: hidden; }
      #root { width: 100%; height: 100%; }
      .scene-index { font: 16px/1.8 Inter, sans-serif; padding: 24px 40px; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="scenes.js"></script>
  </body>
</html>
`;
  const htmlPath = path.join(BUILD_DIR, 'index.html');
  await writeFile(htmlPath, html);
  return htmlPath;
}

/** Reads the existing manifest, so rendering a subset keeps other entries. */
async function readManifest(): Promise<Record<string, ManifestEntry>> {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sceneFiles = await listSceneFiles();
  if (sceneFiles.length === 0) {
    throw new Error(`no scenes found in ${SCENES_DIR}`);
  }
  await loadFonts();
  const htmlPath = await buildBundle(sceneFiles);
  const htmlUrl = pathToFileURL(htmlPath).toString();

  if (args.serve) {
    console.log(`open in a browser to preview scenes:\n  ${htmlUrl}`);
    return;
  }

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    // Load the index once to read each scene's metadata.
    const indexPage = await browser.newPage();
    const errors: string[] = [];
    indexPage.on('pageerror', (err) => errors.push(String(err)));
    await indexPage.goto(htmlUrl);
    await indexPage.waitForFunction(() => (window as any).__SCENES);
    const metas: Record<string, SceneMeta> = await indexPage.evaluate(
      () => (window as any).__SCENES
    );
    await indexPage.close();
    if (errors.length > 0) {
      throw new Error(`scene bundle failed to load:\n${errors.join('\n')}`);
    }

    const ids = args.scenes.length > 0 ? args.scenes : Object.keys(metas);
    const manifest = await readManifest();
    const sourceHash = await hashScreenshotSources(SCREENSHOTS_DIR);
    for (const id of ids) {
      const meta = metas[id];
      if (!meta) {
        throw new Error(`unknown scene: ${id}`);
      }
      const context = await browser.newContext({
        viewport: {width: meta.width, height: meta.height},
        deviceScaleFactor: args.scale,
      });
      const page = await context.newPage();
      page.on('pageerror', (err) => {
        throw new Error(`[${id}] ${err}`);
      });
      await page.goto(`${htmlUrl}#${encodeURIComponent(id)}`);
      await page.waitForSelector('body[data-ready="true"]', {timeout: 30000});
      const outPath = path.join(OUT_DIR, `${id}.png`);
      await page.screenshot({
        path: outPath,
        clip: {x: 0, y: 0, width: meta.width, height: meta.height},
      });
      await context.close();
      manifest[id] = {
        ...meta,
        scale: args.scale,
        file: `${id}.png`,
        sourceHash,
      };
      console.log(`rendered ${path.relative(DOCS_DIR, outPath)}`);
    }
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  } finally {
    await browser.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
