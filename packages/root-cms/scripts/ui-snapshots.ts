/**
 * Captures full-page screenshots of CMS routes at phone, tablet and desktop
 * widths, and builds a side-by-side report comparing two captures. Used to
 * review UI changes before/after (see `ui/README.md`).
 *
 * Runs against a local CMS, by default the docs site (`pnpm dev` from the
 * repo root, at http://localhost:4007). Output goes to `.ui-snapshots/`
 * (gitignored).
 *
 * Usage (from packages/root-cms):
 *   node scripts/ui-snapshots.ts --login           # sign in once (headed)
 *   node scripts/ui-snapshots.ts --label before    # capture every route
 *   node scripts/ui-snapshots.ts --label after --only releases
 *   node scripts/ui-snapshots.ts --compare before,after
 *
 * Options:
 *   --base <url>     CMS origin (default http://localhost:4007).
 *   --only <text>    Only capture routes whose name contains the text.
 *   --widths <list>  Comma-separated widths (default 375,768,1280).
 */

import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {chromium} from 'playwright';

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(PACKAGE_DIR, '.ui-snapshots');
const AUTH_PATH = path.join(OUT_DIR, 'auth.json');
const ROUTES_PATH = path.join(import.meta.dirname, 'ui-snapshots.routes.json');

/** How long to wait after the network goes quiet, for late renders. */
const SETTLE_MS = 1000;

interface SnapshotRoute {
  /** Unique, file-safe name, e.g. `releases`. */
  name: string;
  /** Path to load, e.g. `/cms/releases`. */
  path: string;
}

const {values} = parseArgs({
  options: {
    base: {type: 'string', default: 'http://localhost:4007'},
    login: {type: 'boolean', default: false},
    label: {type: 'string'},
    only: {type: 'string'},
    widths: {type: 'string', default: '375,768,1280'},
    compare: {type: 'string'},
  },
});

if (values.login) {
  await login();
} else if (values.compare) {
  const [before, after] = values.compare.split(',');
  if (!after) {
    throw new Error('Usage: --compare <before>,<after>');
  }
  writeReport(before, after);
} else if (values.label) {
  await capture(values.label);
} else {
  console.error('Pass --login, --label <name> or --compare <a>,<b>.');
  process.exitCode = 1;
}

/** Opens a browser to sign in, then saves the session for later runs. */
async function login() {
  fs.mkdirSync(OUT_DIR, {recursive: true});
  const browser = await chromium.launch({headless: false});
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${values.base}/cms`);
  console.log('Sign in to the CMS in the browser window…');
  // The project page renders the sidebar once the user is signed in.
  await page.waitForSelector('.Layout', {timeout: 5 * 60 * 1000});
  await context.storageState({path: AUTH_PATH, indexedDB: true});
  console.log(`Saved the session to ${path.relative(PACKAGE_DIR, AUTH_PATH)}.`);
  await browser.close();
}

/** Screenshots every route at every width into `.ui-snapshots/<label>/`. */
async function capture(label: string) {
  if (!fs.existsSync(AUTH_PATH)) {
    throw new Error('No saved session; run with --login first.');
  }
  const routes = loadRoutes().filter(
    (route) => !values.only || route.name.includes(values.only)
  );
  const widths = values.widths!.split(',').map(Number);
  const labelDir = path.join(OUT_DIR, label);
  fs.mkdirSync(labelDir, {recursive: true});

  const browser = await chromium.launch();
  const context = await browser.newContext({storageState: AUTH_PATH});
  const page = await context.newPage();
  for (const route of routes) {
    for (const width of widths) {
      await page.setViewportSize({width, height: 900});
      await page.goto(`${values.base}${route.path}`, {waitUntil: 'load'});
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(SETTLE_MS);
      const file = path.join(labelDir, `${route.name}-${width}.png`);
      await page.screenshot({path: file, fullPage: true});
      console.log(`  ${path.relative(PACKAGE_DIR, file)}`);
    }
  }
  await browser.close();
}

/** Writes `.ui-snapshots/<before>-vs-<after>.html`, side by side. */
function writeReport(before: string, after: string) {
  const files = new Set([
    ...listPngs(path.join(OUT_DIR, before)),
    ...listPngs(path.join(OUT_DIR, after)),
  ]);
  const rows = [...files].sort().map((file) => {
    const cell = (label: string) =>
      fs.existsSync(path.join(OUT_DIR, label, file))
        ? `<img src="${label}/${file}" loading="lazy">`
        : '<p>(missing)</p>';
    return `<section><h2>${file}</h2><div class="pair"><figure><figcaption>${before}</figcaption>${cell(before)}</figure><figure><figcaption>${after}</figcaption>${cell(after)}</figure></div></section>`;
  });
  const html = `<!doctype html>
<meta charset="utf-8">
<title>${before} vs ${after}</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 16px; background: #f5f5f3; }
  section { margin-bottom: 32px; }
  h2 { font-size: 14px; }
  .pair { display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; }
  figure { margin: 0; }
  figcaption { color: #646b77; margin-bottom: 4px; }
  img { display: block; max-width: 640px; border: 1px solid #e4e4e1; background: #fff; }
</style>
<h1>${before} vs ${after}</h1>
${rows.join('\n')}
`;
  const reportPath = path.join(OUT_DIR, `${before}-vs-${after}.html`);
  fs.writeFileSync(reportPath, html);
  console.log(`Wrote ${path.relative(PACKAGE_DIR, reportPath)}.`);
}

function loadRoutes(): SnapshotRoute[] {
  return JSON.parse(fs.readFileSync(ROUTES_PATH, 'utf8'));
}

function listPngs(dir: string): string[] {
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((file) => file.endsWith('.png'))
    : [];
}
