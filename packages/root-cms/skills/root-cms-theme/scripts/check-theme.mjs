/**
 * Checks a CMS theme, used by the `root-cms-theme` agent skill. It has no
 * dependencies, so it runs in any project with plain `node`.
 *
 *   node check-theme.mjs path/to/theme.css
 *
 * It reports:
 *
 * - Text and control colors that fall below WCAG contrast (4.5:1 for text,
 *   3:1 for focus rings and filled buttons), with the theme's values layered
 *   over the CMS's stock ones from `../theme.css`. A
 *   `@media (prefers-color-scheme: dark)` block is checked as its own mode.
 * - `--cms-*` properties the CMS doesn't read (usually a typo).
 * - Rules the CMS doesn't support (utility classes such as `.px-3`), rules
 *   that are only best effort (BEM hooks such as `.Button--variant-primary`),
 *   `!important`, and `@import`s that browsers will ignore.
 *
 * Exits with 1 when a contrast check fails, so it can gate a commit.
 *
 * This file is plain JavaScript (not TypeScript) on purpose: it's installed
 * into projects that may not support running `.ts` files directly.
 */

import fs from 'node:fs';
import path from 'node:path';

const STOCK_PATH = path.resolve(import.meta.dirname, '../theme.css');

/**
 * The color pairs to check: `[foreground, background, minimum ratio]`.
 * Text needs 4.5:1; focus rings and filled buttons need 3:1 against what's
 * around them.
 */
const PAIRS = [
  ['--cms-color-text', '--cms-color-page', 4.5],
  ['--cms-color-text', '--cms-color-surface', 4.5],
  ['--cms-color-text', '--cms-color-surface-hover', 4.5],
  ['--cms-color-text', '--cms-color-surface-active', 4.5],
  ['--cms-color-text', '--cms-color-chip', 4.5],
  ['--cms-color-text-strong', '--cms-color-page', 4.5],
  ['--cms-color-text-strong', '--cms-color-surface', 4.5],
  ['--cms-color-text-muted', '--cms-color-page', 4.5],
  ['--cms-color-text-muted', '--cms-color-surface', 4.5],
  ['--cms-color-text-muted', '--cms-color-surface-hover', 4.5],
  ['--cms-color-link', '--cms-color-page', 4.5],
  ['--cms-color-link', '--cms-color-surface', 4.5],
  ['--cms-input-text', '--cms-color-surface', 4.5],
  ['--cms-input-chip-text', '--cms-input-chip', 4.5],
  ['--cms-color-on-primary', '--cms-color-primary', 4.5],
  ['--cms-color-on-primary', '--cms-color-primary-hover', 4.5],
  ['--cms-color-info', '--cms-color-info-soft', 4.5],
  ['--cms-color-info', '--cms-color-surface', 4.5],
  ['--cms-color-success', '--cms-color-success-soft', 4.5],
  ['--cms-color-success', '--cms-color-surface', 4.5],
  ['--cms-color-warning', '--cms-color-warning-soft', 4.5],
  ['--cms-color-warning', '--cms-color-surface', 4.5],
  ['--cms-color-danger', '--cms-color-danger-soft', 4.5],
  ['--cms-color-danger', '--cms-color-surface', 4.5],
  ['--cms-color-violet-strong', '--cms-color-violet-soft', 4.5],
  ['--cms-color-focus', '--cms-color-surface', 3],
  ['--cms-color-focus', '--cms-color-page', 3],
  ['--cms-color-primary', '--cms-color-surface', 3],
];

const NAMED_COLORS = {
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
  transparent: [0, 0, 0, 0],
};

function main() {
  const themePath = process.argv[2];
  if (!themePath || themePath.startsWith('-')) {
    console.error('Usage: node check-theme.mjs <theme.css>');
    process.exit(2);
  }
  const stock = readDeclarations(
    parseRules(fs.readFileSync(STOCK_PATH, 'utf8'))
  );
  const themeCss = fs.readFileSync(themePath, 'utf8');
  const rules = parseRules(themeCss);

  const base = new Map();
  const dark = new Map();
  for (const rule of rules) {
    const isDark = rule.media.some((m) =>
      /prefers-color-scheme:\s*dark/.test(m)
    );
    const target = isDark ? dark : rule.media.length === 0 ? base : null;
    if (target && isRootSelector(rule.selector)) {
      for (const [name, value] of rule.decls) {
        target.set(name, value);
      }
    }
  }

  const warnings = lint(themeCss, rules, stock);
  let failed = false;
  console.log(
    `Checked ${themePath} (${base.size + dark.size} properties set).`
  );
  const modes = [['Light', new Map([...stock, ...base])]];
  if (dark.size > 0) {
    modes.push(['Dark', new Map([...stock, ...base, ...dark])]);
  }
  for (const [label, values] of modes) {
    const result = checkContrast(values);
    failed ||= result.failures.length > 0;
    console.log(`\n${label}:`);
    for (const line of result.failures) {
      console.log(`  ✗ ${line}`);
    }
    for (const line of result.skipped) {
      console.log(`  ? ${line}`);
    }
    console.log(`  ✓ ${result.passed} pairs pass`);
  }
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

/**
 * Splits a stylesheet into rules: each with its selector, the `@media`
 * preludes around it, and its `--cms-*` declarations.
 */
function parseRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      stack.push(text.slice(start, i).trim());
      start = i + 1;
    } else if (ch === '}') {
      const prelude = stack.pop() ?? '';
      if (!prelude.startsWith('@')) {
        const body = text.slice(start, i);
        const decls = [];
        for (const m of body.matchAll(/(--cms-[\w-]+)\s*:\s*([^;]+)/g)) {
          decls.push([m[1], m[2].replace(/!important/, '').trim()]);
        }
        rules.push({
          selector: prelude,
          media: stack.filter((p) => p.startsWith('@media')),
          decls,
          body,
        });
      }
      start = i + 1;
    } else if (ch === ';' && stack.length === 0) {
      start = i + 1;
    }
  }
  return rules;
}

/** Collects every `--cms-*` declaration in `rules`, last one winning. */
function readDeclarations(rules) {
  const values = new Map();
  for (const rule of rules) {
    for (const [name, value] of rule.decls) {
      values.set(name, value);
    }
  }
  return values;
}

function isRootSelector(selector) {
  return selector.split(',').every((s) => [':root', 'html'].includes(s.trim()));
}

/** Warns about anything in the theme that may not work or may not last. */
function lint(css, rules, stock) {
  const warnings = [];
  const unknown = new Set();
  for (const rule of rules) {
    for (const [name] of rule.decls) {
      if (!stock.has(name)) {
        unknown.add(name);
      }
    }
    if (rule.decls.length > 0 && !isRootSelector(rule.selector)) {
      warnings.push(
        `"${rule.selector}" sets --cms-* properties; they only apply inside it, and only :root values are checked here.`
      );
    }
    if (isRootSelector(rule.selector)) {
      continue;
    }
    const classes = [...rule.selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
    const utilities = classes.filter((c) => /^[a-z]/.test(c));
    if (utilities.length > 0) {
      warnings.push(
        `"${rule.selector}" targets utility classes (${utilities.join(', ')}), which may change with any release. Use a --cms-* property or a BEM hook instead.`
      );
    } else if (classes.length > 0) {
      warnings.push(
        `"${rule.selector}" uses BEM hooks, which are best effort: re-check it after upgrading the CMS.`
      );
    }
  }
  for (const name of unknown) {
    warnings.push(`${name} isn't a property the CMS reads (a typo?).`);
  }
  if (/!important/.test(css)) {
    warnings.push(
      "!important isn't needed: themes load after the CMS's layered CSS, so plain rules already win."
    );
  }
  // `@import` only works before every other rule (other than `@charset`).
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const firstRule = stripped.search(/[^\s;]/);
  for (const m of stripped.matchAll(/@import\b/g)) {
    const before = stripped.slice(firstRule, m.index);
    if (before.replace(/@(import|charset)[^;]*;/g, '').trim()) {
      warnings.push(
        '@import comes after other rules, so browsers ignore it. Move it to the top of the file.'
      );
      break;
    }
  }
  return warnings;
}

/** Checks each pair in `PAIRS` against the resolved `values`. */
function checkContrast(values) {
  const failures = [];
  const skipped = [];
  let passed = 0;
  const surface = parseColor(resolve(values, '--cms-color-surface')) ?? [
    255, 255, 255, 1,
  ];
  for (const [fgName, bgName, min] of PAIRS) {
    const fgValue = resolve(values, fgName);
    const bgValue = resolve(values, bgName);
    const fg = parseColor(fgValue);
    const bg = parseColor(bgValue);
    if (!fg || !bg) {
      const bad = !fg ? `${fgName}: ${fgValue}` : `${bgName}: ${bgValue}`;
      skipped.push(`${fgName} on ${bgName}: can't read the color (${bad})`);
      continue;
    }
    // A translucent background shows the surface through it, and a
    // translucent foreground shows its background.
    const solidBg = blend(bg, surface);
    const ratio = contrast(blend(fg, solidBg), solidBg);
    if (ratio + 1e-9 < min) {
      failures.push(
        `${fgName} on ${bgName}: ${ratio.toFixed(2)}:1, needs ${min}:1 (${fgValue} on ${bgValue})`
      );
    } else {
      passed++;
    }
  }
  return {failures, skipped, passed};
}

/** Resolves a property's value, following `var()` references. */
function resolve(values, name, depth = 0) {
  const value = values.get(name);
  if (value === undefined || depth > 20) {
    return undefined;
  }
  return value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
    (_, ref, fallback) => resolve(values, ref, depth + 1) ?? fallback ?? ''
  );
}

/** Parses a hex, `rgb()`, `hsl()` or basic named color to `[r, g, b, a]`. */
function parseColor(value) {
  if (!value) {
    return null;
  }
  const v = value.trim().toLowerCase();
  if (NAMED_COLORS[v]) {
    return NAMED_COLORS[v];
  }
  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = [...h].map((c) => c + c).join('');
    }
    if (h.length !== 6 && h.length !== 8) {
      return null;
    }
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const fn = v.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
  if (!fn) {
    return null;
  }
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  const alpha = parts[3] === undefined ? 1 : number(parts[3], 1);
  if (fn[1].startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map((p) => number(p, 255));
    return [r, g, b, alpha];
  }
  const hue = parseFloat(parts[0]);
  const s = number(parts[1], 1);
  const l = number(parts[2], 1);
  const k = (n) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return [f(0), f(8), f(4), alpha];
}

/** Parses a number or percentage, where 100% is `scale`. */
function number(part, scale) {
  return part.endsWith('%')
    ? (parseFloat(part) / 100) * scale
    : parseFloat(part);
}

/** Composites `fg` over an opaque `bg`. */
function blend(fg, bg) {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1);
}

/** WCAG 2 contrast ratio between two opaque colors. */
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function luminance([r, g, b]) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

main();
