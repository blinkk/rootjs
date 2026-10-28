/**
 * Reports how much of the CMS UI still uses Mantine, by area, and keeps
 * `ui/mantine-allowlist.json` (the files ESLint still lets import Mantine)
 * honest.
 *
 * Usage (from packages/root-cms):
 *   node scripts/ui-progress.ts          # report; exits 1 if the list is stale
 *   node scripts/ui-progress.ts --fix    # also drop migrated files from it
 */

import fs from 'node:fs';
import path from 'node:path';

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..');
const ALLOWLIST_PATH = path.join(PACKAGE_DIR, 'ui/mantine-allowlist.json');
const MANTINE_RE = /from '@mantine\/|vi\.mock\('@mantine\//;

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__screenshots__' ? [] : listSourceFiles(fullPath);
    }
    return /\.tsx?$/.test(entry.name) ? [fullPath] : [];
  });
}

/** Groups a file by area, e.g. `features/releases` or `components`. */
function areaOf(file: string): string {
  const parts = file.split('/');
  return parts[1] === 'features' ? `features/${parts[2]}` : parts[1];
}

const allowlist: string[] = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
const usingMantine = listSourceFiles(path.join(PACKAGE_DIR, 'ui'))
  .map((file) => path.relative(PACKAGE_DIR, file))
  .filter((file) => MANTINE_RE.test(fs.readFileSync(file, 'utf8')))
  .sort();

const byArea = new Map<string, number>();
for (const file of usingMantine) {
  byArea.set(areaOf(file), (byArea.get(areaOf(file)) ?? 0) + 1);
}
console.log('Files still using Mantine, by area:\n');
for (const [area, count] of [...byArea].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${area}`);
}
console.log(`\n  ${String(usingMantine.length).padStart(4)}  total`);

const stale = allowlist.filter((file) => !usingMantine.includes(file));
const unlisted = usingMantine.filter((file) => !allowlist.includes(file));
if (unlisted.length > 0) {
  console.log('\nUsing Mantine but not allowlisted (lint fails on these):');
  unlisted.forEach((file) => console.log(`  ${file}`));
}
if (stale.length > 0) {
  if (process.argv.includes('--fix')) {
    const next = allowlist.filter((file) => !stale.includes(file));
    fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify(next, null, 2) + '\n');
    console.log(
      `\nRemoved ${stale.length} migrated file(s) from the allowlist.`
    );
  } else {
    console.log('\nNo longer use Mantine; remove from the allowlist (--fix):');
    stale.forEach((file) => console.log(`  ${file}`));
    process.exitCode = 1;
  }
}
