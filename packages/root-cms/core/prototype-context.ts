/**
 * Read-only project source, schema, and design-token context loader for Root
 * CMS UX Prototypes (`/cms/api/prototypes.context`).
 *
 * Reads plain text files safely within `rootConfig.rootDir` with strict byte
 * budgets and path traversal guards. Never executes user `.tsx` component code.
 */

import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {RootConfig} from '@blinkk/root';
import type {
  PrototypeProjectContext,
  PrototypeTheme,
  SiteSchemaSummary,
} from '../shared/prototypes.js';
import type {CMSPluginOptions} from './plugin.js';
import {getProjectSchemas} from './project.js';
import type * as schema from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Max bytes read from `ROOT.md`. */
const MAX_ROOT_MD_BYTES = 4 * 1024;

/** Max combined bytes read from `styles/**` files. */
const MAX_STYLES_TOTAL_BYTES = 12 * 1024;

/** Max bytes read from any single style file. */
const MAX_STYLE_FILE_BYTES = 4 * 1024;

/** Max bytes read from any single component source file. */
const MAX_COMPONENT_FILE_BYTES = 6 * 1024;

/** Max combined bytes read across all requested component sources. */
const MAX_COMPONENT_TOTAL_BYTES = 24 * 1024;

/** Max number of component names inspected per request. */
const MAX_COMPONENT_NAMES = 10;

/** Priority order for style files when allocating the 12KB excerpt budget. */
const PRIORITY_STYLE_BASENAMES = [
  'tokens',
  'theme',
  'variables',
  'colors',
  'global',
  'type',
  'typography',
  'base',
];

/** Component source root directories searched for matching `.tsx`/`.scss` files. */
const COMPONENT_SEARCH_DIRS = [
  'templates',
  'components',
  'blocks',
  'elements',
  'layouts',
] as const;

/** Safe identifier pattern for requested component names. */
const SAFE_COMPONENT_NAME_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** Structural Vite dev server interface used to load `project.js` in dev. */
interface ViteSsrLoader {
  ssrLoadModule: (url: string) => Promise<Record<string, any>>;
}

/** Options for `loadPrototypeProjectContext()`. */
export interface LoadPrototypeProjectContextOptions {
  /** Root.js project configuration. */
  rootConfig: RootConfig;
  /** Optional CMS plugin options for resolving project name. */
  cmsConfig?: CMSPluginOptions;
  /** Optional list of schema/component names to load source excerpts for. */
  componentNames?: string[];
  /** Optional Vite dev server for resolving live `virtual:root/schemas`. */
  viteServer?: ViteSsrLoader | null;
}

/** Truncates a UTF-8 string cleanly at `maxBytes` bytes. */
function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return text;
  }
  const buf = Buffer.from(text, 'utf8').subarray(0, maxBytes);
  const sliced = buf.toString('utf8').replace(/\uFFFD+$/, '');
  return `${sliced}\n/* ...truncated... */`;
}

/**
 * Resolves `targetPath` and verifies it (and its realpath when it exists)
 * stays strictly inside `realRootDir`, preventing path traversal and symlink
 * escapes.
 */
async function resolveSafePath(
  realRootDir: string,
  targetPath: string
): Promise<string | null> {
  const resolved = path.resolve(realRootDir, targetPath);
  if (
    resolved !== realRootDir &&
    !resolved.startsWith(`${realRootDir}${path.sep}`)
  ) {
    return null;
  }
  try {
    const realTarget = await fs.realpath(resolved);
    if (
      realTarget !== realRootDir &&
      !realTarget.startsWith(`${realRootDir}${path.sep}`)
    ) {
      return null;
    }
    return realTarget;
  } catch {
    return null;
  }
}

/** Safely reads a UTF-8 text file inside `realRootDir`, returning null on error. */
async function readSafeTextFile(
  realRootDir: string,
  relativePath: string,
  maxBytes: number
): Promise<string | null> {
  const safePath = await resolveSafePath(realRootDir, relativePath);
  if (!safePath) {
    return null;
  }
  try {
    const stat = await fs.stat(safePath);
    if (!stat.isFile()) {
      return null;
    }
    const raw = await fs.readFile(safePath, 'utf8');
    return truncateUtf8(raw, maxBytes);
  } catch {
    return null;
  }
}

/** Recursively lists matching files inside a subdirectory of `realRootDir`. */
async function walkSafeFiles(
  realRootDir: string,
  startRelDir: string,
  extensions: Set<string>,
  maxDepth = 5
): Promise<string[]> {
  const safeDir = await resolveSafePath(realRootDir, startRelDir);
  if (!safeDir) {
    return [];
  }
  const results: string[] = [];

  async function visit(absDir: string, depth: number) {
    if (depth > maxDepth) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(absDir, {withFileTypes: true});
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      const childAbs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        const safeChild = await resolveSafePath(realRootDir, childAbs);
        if (safeChild) {
          await visit(safeChild, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.has(ext)) {
          const safeFile = await resolveSafePath(realRootDir, childAbs);
          if (safeFile) {
            const rel = path
              .relative(realRootDir, safeFile)
              .split(path.sep)
              .join('/');
            results.push(rel);
          }
        }
      }
    }
  }

  await visit(safeDir, 0);
  return results;
}

/** Converts a `schema.Schema` into a compact `SiteSchemaSummary`. */
function toSiteSchemaSummary(schemaObj: schema.Schema): SiteSchemaSummary {
  const fields: SiteSchemaSummary['fields'] = [];
  for (const field of schemaObj.fields || []) {
    if (!field?.id || field.hidden || field.deprecated) {
      continue;
    }
    fields.push({
      id: field.id,
      ...(field.label ? {label: field.label} : {}),
      type: field.type,
      ...(field.help ? {help: field.help} : {}),
    });
  }
  const presets = (schemaObj.presets || [])
    .map((p) => p.label || p.id)
    .filter(Boolean);
  return {
    name: schemaObj.name,
    label: schemaObj.label || schemaObj.name,
    ...(schemaObj.description ? {description: schemaObj.description} : {}),
    fields,
    ...(presets.length > 0 ? {presets} : {}),
  };
}

/** Loads non-collection schemas from `getProjectSchemas()`. */
async function loadSiteSchemas(
  viteServer?: ViteSsrLoader | null
): Promise<SiteSchemaSummary[]> {
  let rawSchemas: Record<string, schema.Schema> = {};
  try {
    if (viteServer) {
      const projectMod = await viteServer.ssrLoadModule(
        path.resolve(__dirname, './project.js')
      );
      if (typeof projectMod?.getProjectSchemas === 'function') {
        rawSchemas = projectMod.getProjectSchemas() || {};
      }
    } else {
      rawSchemas = getProjectSchemas() || {};
    }
  } catch (err) {
    console.warn('[prototypes] failed to load project schemas:', err);
    return [];
  }

  const summariesByName = new Map<string, SiteSchemaSummary>();
  for (const [fileId, schemaObj] of Object.entries(rawSchemas)) {
    if (fileId.startsWith('/collections/')) {
      continue;
    }
    if (!schemaObj?.name) {
      continue;
    }
    summariesByName.set(schemaObj.name, toSiteSchemaSummary(schemaObj));
  }
  return Array.from(summariesByName.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/** Discovers UI components in `components/`, `elements/`, and `layouts/` that lack `.schema.ts` files. */
async function discoverNonSchemaComponents(
  realRootDir: string,
  existingNames: Set<string>
): Promise<SiteSchemaSummary[]> {
  const discovered: SiteSchemaSummary[] = [];
  const seen = new Set(Array.from(existingNames, (n) => n.toLowerCase()));
  const uiDirs = ['components', 'elements', 'layouts'] as const;

  for (const dir of uiDirs) {
    const tsxFiles = await walkSafeFiles(
      realRootDir,
      dir,
      new Set(['.tsx']),
      3
    );
    for (const relPath of tsxFiles) {
      if (relPath.endsWith('.test.tsx') || relPath.endsWith('.stories.tsx')) {
        continue;
      }
      const segments = relPath.split('/');
      const fileBase = path.basename(relPath, '.tsx');
      const parentName =
        segments.length >= 3 ? segments[segments.length - 2] : fileBase;
      const candidate = fileBase === 'index' ? parentName : fileBase;
      if (!SAFE_COMPONENT_NAME_RE.test(candidate)) {
        continue;
      }
      const key = candidate.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      discovered.push({
        name: candidate,
        label: candidate,
        description: `Project ${dir.replace(/s$/, '')} (${relPath})`,
        fields: [],
      });
    }
  }
  return discovered;
}

/** Sorts style file paths so token/theme/global stylesheets are read first. */
function sortStylePaths(paths: string[]): string[] {
  const rank = (relPath: string): number => {
    const base = path.basename(relPath, path.extname(relPath)).toLowerCase();
    const idx = PRIORITY_STYLE_BASENAMES.indexOf(base);
    return idx === -1 ? PRIORITY_STYLE_BASENAMES.length : idx;
  };
  return [...paths].sort((a, b) => {
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

/** Checks whether a value looks like a concrete CSS color literal. */
function isConcreteColor(val: string): boolean {
  return /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([^)]+\)|white|black)$/i.test(
    val.trim()
  );
}

/** Cleans an extracted SCSS/CSS token value, skipping dynamic expressions. */
function cleanExtractedToken(raw: string): string | null {
  const cleaned = raw
    .replace(/!default\b/gi, '')
    .replace(/!important\b/gi, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  if (
    !cleaned ||
    cleaned.includes('#{') ||
    cleaned.includes('var(') ||
    cleaned.includes('$') ||
    cleaned.includes('{') ||
    cleaned.includes('}')
  ) {
    return null;
  }
  return cleaned;
}

/**
 * Heuristically extracts brand theme tokens (colors, fonts, radius, container
 * width, and Google Fonts URLs) from project stylesheets.
 */
function extractDefaultTheme(
  styleExcerpts: Array<{path: string; content: string}>
): PrototypeTheme {
  const vars = new Map<string, string>();
  const fontUrls = new Set<string>();

  for (const file of styleExcerpts) {
    const text = file.content;

    // Collect Google Fonts stylesheet URLs if referenced in CSS/SCSS.
    const fontUrlRe = /https:\/\/fonts\.googleapis\.com\/css2?\?[^'"\s)]+/g;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = fontUrlRe.exec(text)) !== null) {
      fontUrls.add(urlMatch[0]);
    }

    // Collect CSS custom properties (`--foo: value;`).
    const cssVarRe = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;\n}]+);/g;
    let match: RegExpExecArray | null;
    while ((match = cssVarRe.exec(text)) !== null) {
      const key = match[1].toLowerCase();
      const val = cleanExtractedToken(match[2]);
      if (val && !vars.has(key)) {
        vars.set(key, val);
      }
    }

    // Collect SCSS variables (`$foo: value;`).
    const scssVarRe = /(\$[a-zA-Z0-9_-]+)\s*:\s*([^;\n}]+);/g;
    while ((match = scssVarRe.exec(text)) !== null) {
      const key = match[1].toLowerCase();
      const val = cleanExtractedToken(match[2]);
      if (val && !vars.has(key)) {
        vars.set(key, val);
      }
    }
  }

  const pickColor = (keys: string[]): string | undefined => {
    for (const key of keys) {
      const val = vars.get(key);
      if (val && isConcreteColor(val)) {
        return val;
      }
    }
    return undefined;
  };

  const pickValue = (keys: string[]): string | undefined => {
    for (const key of keys) {
      const val = vars.get(key);
      if (val) {
        return val;
      }
    }
    return undefined;
  };

  const theme: PrototypeTheme = {};

  const colorBg = pickColor([
    '--color-bg',
    '--color-background',
    '--bg',
    '--background',
    '$color-bg',
    '$color-background',
    '$color-background-default',
  ]);
  if (colorBg) theme.colorBg = colorBg;

  const colorSurface = pickColor([
    '--color-surface',
    '--surface',
    '--color-surface-subtle',
    '--color-card',
    '$color-surface',
    '$color-background-subtle',
  ]);
  if (colorSurface) theme.colorSurface = colorSurface;

  const colorFg = pickColor([
    '--color-fg',
    '--color-text',
    '--color-text-default',
    '--color-foreground',
    '--fg',
    '$color-text-default',
    '$color-text',
    '$color-fg',
  ]);
  if (colorFg) theme.colorFg = colorFg;

  const colorMuted = pickColor([
    '--color-muted',
    '--color-text-muted',
    '--color-text-secondary',
    '$color-text-muted',
    '$color-text-secondary',
    '$color-muted',
  ]);
  if (colorMuted) theme.colorMuted = colorMuted;

  const colorPrimary = pickColor([
    '--color-primary',
    '--color-accent',
    '--color-brand',
    '--primary',
    '$color-primary',
    '$color-accent',
    '$color-brand',
  ]);
  if (colorPrimary) theme.colorPrimary = colorPrimary;

  const colorOnPrimary = pickColor([
    '--color-on-primary',
    '--color-primary-fg',
    '--color-primary-text',
    '$color-on-primary',
  ]);
  if (colorOnPrimary) theme.colorOnPrimary = colorOnPrimary;

  const colorBorder = pickColor([
    '--color-border',
    '--border-color',
    '$color-border',
    '$border-color',
  ]);
  if (colorBorder) theme.colorBorder = colorBorder;

  const fontSans = pickValue([
    '--font-sans',
    '--font-family-default',
    '--font-family-sans',
    '--font-body',
    '$font-family-default',
    '$font-sans',
    '$font-body',
  ]);
  if (fontSans) theme.fontSans = fontSans;

  const fontHeading = pickValue([
    '--font-heading',
    '--font-display',
    '--font-family-heading',
    '--font-family-display',
    '$font-family-heading',
    '$font-heading',
    '$font-display',
  ]);
  if (fontHeading) theme.fontHeading = fontHeading;

  const fontMono = pickValue([
    '--font-mono',
    '--font-family-mono',
    '$font-family-mono',
    '$font-mono',
  ]);
  if (fontMono) theme.fontMono = fontMono;

  const radius = pickValue([
    '--radius-base',
    '--radius',
    '--border-radius',
    '$radius-base',
    '$border-radius',
  ]);
  if (radius) theme.radius = radius;

  const containerMaxWidth = pickValue([
    '--max-w-container',
    '--container-max-width',
    '--site-max-width',
    '$site-max-width',
    '$container-max-width',
  ]);
  if (containerMaxWidth) theme.containerMaxWidth = containerMaxWidth;

  if (fontUrls.size > 0) {
    theme.fontUrls = Array.from(fontUrls);
  }

  return theme;
}

/** Loads bounded plain-text `.tsx` and `.scss`/`.css` excerpts for named components. */
async function loadComponentSources(
  realRootDir: string,
  componentNames: string[]
): Promise<Record<string, Array<{path: string; content: string}>>> {
  const validNames = Array.from(
    new Set(
      componentNames
        .map((n) => String(n || '').trim())
        .filter((n) => SAFE_COMPONENT_NAME_RE.test(n))
    )
  ).slice(0, MAX_COMPONENT_NAMES);

  if (validNames.length === 0) {
    return {};
  }

  // Index candidate `.tsx`, `.scss`, and `.css` files under component dirs.
  const allowedExts = new Set(['.tsx', '.scss', '.css']);
  const allFiles: string[] = [];
  for (const dir of COMPONENT_SEARCH_DIRS) {
    const files = await walkSafeFiles(realRootDir, dir, allowedExts, 4);
    allFiles.push(...files);
  }

  const result: Record<string, Array<{path: string; content: string}>> = {};
  let totalBytes = 0;

  for (const name of validNames) {
    if (totalBytes >= MAX_COMPONENT_TOTAL_BYTES) {
      break;
    }
    const lowerName = name.toLowerCase();
    const strippedLower = lowerName.replace(/^template/, '');
    const matched = allFiles.filter((relPath) => {
      const segments = relPath.split('/');
      const fileName = segments[segments.length - 1];
      const baseNoExt = fileName
        .replace(/\.(?:module\.)?(?:tsx|scss|css)$/i, '')
        .toLowerCase();
      const parentDir = (
        segments.length >= 2 ? segments[segments.length - 2] : ''
      ).toLowerCase();
      return (
        baseNoExt === lowerName ||
        parentDir === lowerName ||
        (strippedLower.length >= 3 &&
          (baseNoExt === strippedLower || parentDir === strippedLower))
      );
    });

    // Prefer `.tsx` before `.scss`/`.css`.
    matched.sort((a, b) => {
      const aIsTsx = a.endsWith('.tsx') ? 0 : 1;
      const bIsTsx = b.endsWith('.tsx') ? 0 : 1;
      return aIsTsx - bIsTsx || a.localeCompare(b);
    });

    const excerpts: Array<{path: string; content: string}> = [];
    for (const relPath of matched) {
      const remaining = MAX_COMPONENT_TOTAL_BYTES - totalBytes;
      if (remaining <= 0) {
        break;
      }
      const budget = Math.min(MAX_COMPONENT_FILE_BYTES, remaining);
      const content = await readSafeTextFile(realRootDir, relPath, budget);
      if (content !== null) {
        totalBytes += Buffer.byteLength(content, 'utf8');
        excerpts.push({path: relPath, content});
      }
    }

    if (excerpts.length > 0) {
      result[name] = excerpts;
    }
  }

  return result;
}

/**
 * Collects read-only project context for UX Prototyping: non-collection site
 * schemas, `ROOT.md` excerpt, bounded `styles/**` excerpts, heuristically
 * extracted `defaultTheme` tokens, and optional component source excerpts.
 */
export async function loadPrototypeProjectContext(
  options: LoadPrototypeProjectContextOptions
): Promise<PrototypeProjectContext> {
  const rootDir = options.rootConfig.rootDir;
  let realRootDir: string;
  try {
    realRootDir = await fs.realpath(rootDir);
  } catch {
    realRootDir = path.resolve(rootDir);
  }

  const projectName =
    options.cmsConfig?.name ||
    options.cmsConfig?.id ||
    path.basename(realRootDir) ||
    'Project';

  const [schemaDefs, rootMdRaw, stylePaths] = await Promise.all([
    loadSiteSchemas(options.viteServer),
    readSafeTextFile(realRootDir, 'ROOT.md', MAX_ROOT_MD_BYTES),
    walkSafeFiles(realRootDir, 'styles', new Set(['.css', '.scss']), 4),
  ]);
  const uiComponents = await discoverNonSchemaComponents(
    realRootDir,
    new Set(schemaDefs.map((s) => s.name))
  );
  const schemas = [...schemaDefs, ...uiComponents];

  const sortedStylePaths = sortStylePaths(stylePaths);
  const styleExcerpts: Array<{path: string; content: string}> = [];
  let stylesBytes = 0;

  for (const relPath of sortedStylePaths) {
    const remaining = MAX_STYLES_TOTAL_BYTES - stylesBytes;
    if (remaining <= 0) {
      break;
    }
    const budget = Math.min(MAX_STYLE_FILE_BYTES, remaining);
    const content = await readSafeTextFile(realRootDir, relPath, budget);
    if (content !== null) {
      stylesBytes += Buffer.byteLength(content, 'utf8');
      styleExcerpts.push({path: relPath, content});
    }
  }

  const defaultTheme = extractDefaultTheme(styleExcerpts);

  let componentSources:
    Record<string, Array<{path: string; content: string}>> | undefined;
  if (
    Array.isArray(options.componentNames) &&
    options.componentNames.length > 0
  ) {
    componentSources = await loadComponentSources(
      realRootDir,
      options.componentNames
    );
  }

  return {
    projectName,
    schemas,
    defaultTheme,
    ...(rootMdRaw ? {rootMdExcerpt: rootMdRaw} : {}),
    ...(styleExcerpts.length > 0 ? {styleExcerpts} : {}),
    ...(componentSources ? {componentSources} : {}),
  };
}
