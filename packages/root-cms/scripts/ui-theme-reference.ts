/**
 * Generates the theming reference in `docs/themes.md`: every `--cms-*`
 * custom property in `ui/styles/theme.css` (with its stock value and note),
 * and every BEM hook (block, `__element` and `--modifier` class) the UI
 * renders or styles, grouped by area.
 *
 * The reference sits between the `<!-- reference:start -->` and
 * `<!-- reference:end -->` markers; the rest of the doc is hand-written.
 *
 * Usage (from packages/root-cms):
 *   node scripts/ui-theme-reference.ts          # rewrite the reference
 *   node scripts/ui-theme-reference.ts --check  # fail if it's out of date
 */

import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import * as prettier from 'prettier';

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..');
const UI_DIR = path.join(PACKAGE_DIR, 'ui');
const THEME_PATH = path.join(UI_DIR, 'styles/theme.css');
const DOC_PATH = path.join(PACKAGE_DIR, 'docs/themes.md');
const START = '<!-- reference:start -->';
const END = '<!-- reference:end -->';

/** A custom property from theme.css. */
interface Token {
  name: string;
  value: string;
  note: string;
}

/** A section of theme.css (a `--- Title ---` comment) and its properties. */
interface TokenGroup {
  title: string;
  tokens: Token[];
}

/** The classes of one BEM block. */
interface Block {
  elements: Set<string>;
  modifiers: Set<string>;
}

/** Normalizes a comment's text to one line. */
function commentText(comment: string): string {
  return comment
    .replace(/^\/\*+|\*+\/$/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reads the tokens in theme.css's first `:root` block, by section. */
function readTokens(): TokenGroup[] {
  const css = fs.readFileSync(THEME_PATH, 'utf8');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}\n'));
  const groups: TokenGroup[] = [];
  let note = '';
  // Comments, and declarations (which may span several lines).
  const re = /(\/\*[\s\S]*?\*\/)|(--cms-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  for (const match of root.matchAll(re)) {
    if (match[1]) {
      const text = commentText(match[1]);
      const section = text.match(/^-+\s*(.+?)\s*-+(?:\s+(.*))?$/);
      if (section) {
        groups.push({title: section[1], tokens: []});
        note = section[2] || '';
      } else {
        note = text;
      }
      continue;
    }
    if (groups.length === 0) {
      groups.push({title: 'Tokens', tokens: []});
    }
    groups[groups.length - 1].tokens.push({
      name: match[2],
      value: match[3].replace(/\s+/g, ' ').trim(),
      note,
    });
    note = '';
  }
  return groups;
}

/** Lists the files under `dir` with one of the extensions, recursively. */
function listFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__screenshots__' && entry.name !== 'dev') {
        out.push(...listFiles(full, exts));
      }
    } else if (
      exts.some((ext) => entry.name.endsWith(ext)) &&
      !/\.(test|gallery)\.tsx?$/.test(entry.name) &&
      entry.name !== 'tailwind.out.css'
    ) {
      out.push(full);
    }
  }
  return out;
}

/** The area a file belongs to, e.g. `primitives` or `features/releases`. */
function areaOf(file: string): string {
  const parts = path.relative(UI_DIR, file).split(path.sep);
  if (parts[0] === 'features' && parts.length > 2) {
    return `features/${parts[1]}`;
  }
  return parts.length > 1 ? parts[0] : 'app';
}

/** A BEM class: `Block`, `Block__element`, `Block--modifier`, etc. */
const BEM_CLASS =
  /(?<![\w$.-])([A-Z][A-Za-z0-9]*)((?:__[A-Za-z0-9]+)*)(--[a-z0-9][A-Za-z0-9]*(?:-[a-z0-9][A-Za-z0-9]*)*-?)?(\$\{)?/g;

/** Where a bare block name counts as a class rather than a word. */
const CLASS_CONTEXT =
  /(?:className=|class=|cn\(|joinClassNames\()\s*\{?\s*(?:\n\s*)?['"`]([A-Z][A-Za-z0-9]*)[\s'"`]/g;

/**
 * Collects the BEM hooks, by area and block. A block is listed once, under
 * the area of its component (`<Block>.tsx`), or else the first area (in
 * `areaOrder`) that uses it.
 */
function readHooks(): Map<string, Map<string, Block>> {
  const blocks = new Map<string, Block>();
  const homes = new Map<string, string>();
  const usedIn = new Map<string, Set<string>>();
  const getBlock = (area: string, name: string) => {
    let block = blocks.get(name);
    if (!block) {
      block = {elements: new Set(), modifiers: new Set()};
      blocks.set(name, block);
      usedIn.set(name, new Set());
    }
    usedIn.get(name)!.add(area);
    return block;
  };

  for (const file of listFiles(UI_DIR, ['.tsx', '.ts', '.css'])) {
    const area = areaOf(file);
    homes.set(path.basename(file).replace(/\.(tsx?|css)$/, ''), area);
    let text = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.css')) {
      // Only class selectors count in CSS.
      text = text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of text.matchAll(/\.([A-Z][\w-]*)/g)) {
        addClass(match[1]);
      }
      continue;
    }
    // Only string literals count in TS: tokens in quotes or template text,
    // outside comments (which hold usage examples).
    text = text.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
    for (const literal of text.matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g)) {
      for (const match of literal[0].matchAll(BEM_CLASS)) {
        const [, , elements, modifier, interpolated] = match;
        if (elements || modifier) {
          addClass(match[0].replace('${', '*'), Boolean(interpolated));
        }
      }
    }
    for (const match of text.matchAll(CLASS_CONTEXT)) {
      getBlock(area, match[1]);
    }

    function addClass(cls: string, interpolated = false) {
      const m = cls.match(
        /^([A-Z][A-Za-z0-9]*)((?:__[A-Za-z0-9]+)*)(--[\w*-]+)?$/
      );
      if (!m) {
        return;
      }
      const [, name, elements, modifier] = m;
      const block = getBlock(area, name);
      if (elements) {
        block.elements.add(elements);
      }
      if (modifier) {
        let mod = `${elements}${modifier}`;
        if (interpolated && !mod.endsWith('*')) {
          mod += '*';
        }
        block.modifiers.add(mod.replace(/-\*$/, '-*'));
      }
    }
  }

  const areas = new Map<string, Map<string, Block>>();
  for (const [name, block] of blocks) {
    const area =
      homes.get(name) ??
      [...usedIn.get(name)!].sort((a, b) =>
        areaOrder(a).localeCompare(areaOrder(b))
      )[0];
    if (!areas.has(area)) {
      areas.set(area, new Map());
    }
    areas.get(area)!.set(name, block);
  }
  return areas;
}

/** Orders areas: primitives, components, app, then features A–Z. */
function areaOrder(area: string): string {
  const order = ['primitives', 'components', 'app', 'styles', 'hooks', 'utils'];
  const index = order.indexOf(area);
  return index === -1 ? `9${area}` : `${index}`;
}

function renderReference(): string {
  const lines: string[] = [START, ''];
  lines.push(
    '_Generated by `node scripts/ui-theme-reference.ts`; edit `ui/styles/theme.css` or the components, then re-run it._',
    ''
  );

  lines.push('### Custom properties', '');
  for (const group of readTokens()) {
    lines.push(`#### ${group.title}`, '');
    lines.push('| Property | Stock value | Use |', '| --- | --- | --- |');
    for (const token of group.tokens) {
      const value = token.value.replace(/\|/g, '\\|');
      lines.push(`| \`${token.name}\` | \`${value}\` | ${token.note} |`);
    }
    lines.push('');
  }

  lines.push('### BEM hooks', '');
  lines.push(
    'Each block, with its `__elements` and `--modifiers`. A `*` stands for a value filled in at runtime (e.g. `Button--variant-*`).',
    ''
  );
  const areas = readHooks();
  const sortedAreas = [...areas.keys()].sort((a, b) =>
    areaOrder(a).localeCompare(areaOrder(b))
  );
  for (const area of sortedAreas) {
    const blocks = areas.get(area)!;
    lines.push(`#### \`ui/${area}\``, '');
    for (const name of [...blocks.keys()].sort()) {
      const block = blocks.get(name)!;
      const parts = [`- \`${name}\``];
      const elements = [...block.elements].sort();
      const modifiers = [...block.modifiers].sort();
      if (elements.length > 0) {
        parts.push(`: ${elements.map((e) => `\`${e}\``).join(', ')}`);
      }
      if (modifiers.length > 0) {
        parts.push(
          `${elements.length > 0 ? '; ' : ': '}${modifiers.map((m) => `\`${m}\``).join(', ')}`
        );
      }
      lines.push(parts.join(''));
    }
    lines.push('');
  }
  lines.push(END);
  return lines.join('\n');
}

async function main() {
  const {values} = parseArgs({options: {check: {type: 'boolean'}}});
  const doc = fs.readFileSync(DOC_PATH, 'utf8');
  const start = doc.indexOf(START);
  const end = doc.indexOf(END);
  if (start === -1 || end === -1) {
    throw new Error(`${DOC_PATH} is missing the ${START} / ${END} markers.`);
  }
  // Formatted as `pnpm lint` would, so `--check` agrees with prettier.
  const next = await prettier.format(
    doc.slice(0, start) + renderReference() + doc.slice(end + END.length),
    {...(await prettier.resolveConfig(DOC_PATH)), filepath: DOC_PATH}
  );
  if (values.check) {
    if (next !== doc) {
      console.error(
        'docs/themes.md is out of date; run `node scripts/ui-theme-reference.ts`.'
      );
      process.exit(1);
    }
    console.log('docs/themes.md is up to date.');
    return;
  }
  fs.writeFileSync(DOC_PATH, next);
  console.log('Updated docs/themes.md.');
}

await main();
