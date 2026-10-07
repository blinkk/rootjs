/**
 * Helper for upgrading a Root.js project to v4, used by the `root-v4-upgrade`
 * agent skill. It has no dependencies, so it runs in any project (including a
 * v3 project before anything is upgraded) with plain `node`.
 *
 * Commands:
 *
 *   # Scan the project for things to change for v4 (packages, config flags,
 *   # CMS routes, data fetching and hard-coded secrets).
 *   node root-v4-upgrade.mjs audit [--json]
 *
 *   # Save the HTML of the site's pages from a running server. Pages are
 *   # discovered by crawling links (and hreflang alternates) from `/`, or
 *   # read from a list.
 *   node root-v4-upgrade.mjs snapshot --base-url http://localhost:4007 \
 *     --out .root/upgrade/before [--paths paths.txt] [--max 300]
 *   node root-v4-upgrade.mjs snapshot --base-url http://localhost:4007 \
 *     --out .root/upgrade/after --paths-from .root/upgrade/before
 *
 *   # Compare two snapshots and write a report of what changed.
 *   node root-v4-upgrade.mjs compare .root/upgrade/before .root/upgrade/after \
 *     [--out .root/upgrade/report.md]
 *
 * This file is plain JavaScript (not TypeScript) on purpose: it's downloaded
 * into projects that may not support running `.ts` files directly.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const USAGE = `Usage:
  node root-v4-upgrade.mjs audit [--json]
  node root-v4-upgrade.mjs snapshot --base-url <url> --out <dir> [--paths <file>] [--paths-from <snapshot dir>] [--max <n>] [--concurrency <n>]
  node root-v4-upgrade.mjs compare <before dir> <after dir> [--out <report.md>]`;

/** Directories that are never scanned. */
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.root',
  '.cache',
  '.turbo',
  '.next',
  'coverage',
  'gen',
]);

/** File extensions scanned by the audit. */
const SOURCE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);

/** Config files (besides source files) scanned for hard-coded secrets. */
const CONFIG_EXTS = new Set(['.json', '.yaml', '.yml', '.toml']);

// -----------------------------------------------------------------------------
// CLI.
// -----------------------------------------------------------------------------

async function main(argv) {
  const [command, ...rest] = argv;
  const {positional, flags} = parseArgs(rest);
  if (command === 'audit') {
    return audit({rootDir: process.cwd(), json: Boolean(flags.json)});
  }
  if (command === 'snapshot') {
    if (!flags['base-url'] || !flags.out) {
      fail('snapshot requires --base-url and --out');
    }
    return snapshot({
      baseUrl: String(flags['base-url']),
      outDir: path.resolve(String(flags.out)),
      pathsFile: flags.paths ? String(flags.paths) : undefined,
      pathsFrom: flags['paths-from'] ? String(flags['paths-from']) : undefined,
      max: Number(flags.max || 300),
      concurrency: Number(flags.concurrency || 4),
    });
  }
  if (command === 'compare') {
    if (positional.length !== 2) {
      fail('compare requires a before and after snapshot dir');
    }
    return compare({
      beforeDir: path.resolve(positional[0]),
      afterDir: path.resolve(positional[1]),
      outFile: flags.out ? path.resolve(String(flags.out)) : undefined,
    });
  }
  console.log(USAGE);
  process.exitCode = command ? 1 : 0;
}

/** Parses `--flag value`, `--flag=value` and boolean `--flag` args. */
function parseArgs(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq > 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
      flags[arg.slice(2)] = args[++i];
    } else {
      flags[arg.slice(2)] = true;
    }
  }
  return {positional, flags};
}

function fail(message) {
  console.error(`error: ${message}\n\n${USAGE}`);
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Audit.
// -----------------------------------------------------------------------------

/**
 * A single audit finding.
 *
 * - `action`: needs a change for v4 to work as before.
 * - `suggestion`: recommended for v4, but optional.
 * - `info`: worth knowing, no change needed.
 *
 * @typedef {{
 *   category: string,
 *   severity: 'action' | 'suggestion' | 'info',
 *   message: string,
 *   file?: string,
 *   line?: number,
 *   snippet?: string,
 * }} Finding
 */

function audit({rootDir, json}) {
  /** @type {Finding[]} */
  const findings = [];
  const add = (finding) => findings.push(finding);

  const pkg = readJson(path.join(rootDir, 'package.json'));
  if (!pkg) {
    fail('no package.json found; run the audit from the project root');
  }

  auditPackages(rootDir, pkg, add);
  const files = listFiles(rootDir);
  const sources = files
    .filter((file) => SOURCE_EXTS.has(path.extname(file)))
    .map((file) => ({file, text: readText(path.join(rootDir, file))}))
    .filter((source) => source.text !== null);
  auditConfig(rootDir, sources, add);
  auditRoutes(sources, add);
  auditDataFetching(sources, add);
  auditSecrets(rootDir, files, sources, add);
  auditCi(rootDir, files, add);

  const summary = {action: 0, suggestion: 0, info: 0};
  findings.forEach((finding) => summary[finding.severity]++);
  if (json) {
    console.log(JSON.stringify({rootDir, summary, findings}, null, 2));
    return;
  }
  console.log(formatAudit(findings, summary));
}

function auditPackages(rootDir, pkg, add) {
  const deps = {...pkg.dependencies, ...pkg.devDependencies};
  const rootPackages = Object.keys(deps).filter(
    (name) => name.startsWith('@blinkk/root') || name === '@blinkk/create-root'
  );
  if (rootPackages.length === 0) {
    add({
      category: 'packages',
      severity: 'info',
      message:
        'package.json has no @blinkk/root* dependencies. Is this the project root?',
    });
  }
  for (const name of rootPackages) {
    const range = deps[name];
    const installed = readJson(
      path.join(rootDir, 'node_modules', name, 'package.json')
    )?.version;
    const major = parseMajor(installed || range);
    add({
      category: 'packages',
      severity: major !== null && major >= 4 ? 'info' : 'action',
      message:
        `${name}: ${range}` +
        (installed ? ` (installed: ${installed})` : '') +
        (major !== null && major >= 4 ? '' : ' -> upgrade to ^4'),
      file: 'package.json',
    });
  }

  const nodeMajor = parseMajor(process.version);
  if (nodeMajor !== null && nodeMajor < 24) {
    add({
      category: 'packages',
      severity: 'action',
      message: `Node ${process.version} is running; Root.js v4 requires Node 24 or later.`,
    });
  }
  for (const file of ['.node-version', '.nvmrc']) {
    const version = readText(path.join(rootDir, file))?.trim();
    const major = parseMajor(version);
    if (version && major !== null && major < 24) {
      add({
        category: 'packages',
        severity: 'action',
        message: `${file} pins Node ${version}; Root.js v4 requires Node 24 or later.`,
        file,
      });
    }
  }
  const enginesMajor = parseMajor(pkg.engines?.node);
  if (enginesMajor !== null && enginesMajor < 24) {
    add({
      category: 'packages',
      severity: 'suggestion',
      message: `package.json engines.node is "${pkg.engines.node}"; update it to ">=24".`,
      file: 'package.json',
    });
  }
}

/** Config flags that v4 turns on by default. */
const DEFAULT_ON_FLAGS = [
  {
    re: /v2TranslationsManager\s*:\s*true/,
    message:
      '`experiments.v2TranslationsManager: true` is the default in v4 and can be removed.',
  },
  {
    re: /dependencyGraph\s*:\s*true/,
    message: '`dependencyGraph: true` is the default in v4 and can be removed.',
  },
  {
    re: /modulePreload\s*:\s*true/,
    message: '`modulePreload: true` is the default in v4 and can be removed.',
  },
  {
    re: /taskManager\s*:\s*true/,
    message:
      '`experiments.taskManager: true` is the default in v4 and can be removed.',
  },
];

function auditConfig(rootDir, sources, add) {
  const configs = sources.filter((source) =>
    /(^|\/)root\.config\.[mc]?[jt]sx?$/.test(source.file)
  );
  if (configs.length === 0) {
    add({
      category: 'config',
      severity: 'info',
      message: 'No root.config.ts found.',
    });
  }
  for (const {file, text} of configs) {
    for (const flag of DEFAULT_ON_FLAGS) {
      forEachMatch(text, flag.re, (line, snippet) => {
        add({
          category: 'config',
          severity: 'suggestion',
          message: flag.message,
          file,
          line,
          snippet,
        });
      });
    }
    forEachMatch(text, /v2TranslationsManager\s*:\s*false/, (line, snippet) => {
      add({
        category: 'translations',
        severity: 'action',
        message:
          'The v2 translations manager is turned off, so the v1 -> v2 ' +
          'translations migration will not run. Remove this opt-out to ' +
          'migrate (ask the user first; they may have opted out on purpose).',
        file,
        line,
        snippet,
      });
    });
    if (/cmsPlugin\s*\(/.test(text)) {
      add({
        category: 'translations',
        severity: 'info',
        message:
          'The CMS is enabled. v4 migrates v1 translations to the v2 ' +
          'translations manager; run `root-cms translations.migrate --status` ' +
          'after upgrading.',
        file,
      });
    }
  }
}

/** Matches calls that read CMS content. */
const CMS_READ_RE =
  /\b(?:getDoc|listDocs|getRawDoc|getFromDataSource|getDataSource|loadTranslations|loadTranslationsForLocale|getAllData|getQueryData)\s*(?:<[^>()]*>)?\s*\(/g;

/** Matches reads of the v1 translations collection. */
const V1_TRANSLATIONS_RE =
  /\b(?:loadTranslations|loadTranslationsForLocale)\s*\(/g;

function auditRoutes(sources, add) {
  const routes = sources.filter(
    (source) =>
      /(^|\/)routes\//.test(source.file) &&
      !/\.(test|spec)\.[mc]?[jt]sx?$/.test(source.file) &&
      !path.basename(source.file).startsWith('_')
  );
  for (const {file, text} of routes) {
    const usesCreateRoute = /\bcreateRoute\s*\(/.test(text);
    const usesCms = /@blinkk\/root-cms|\bRootCMSClient\b|\bcmsClient\b/.test(
      text
    );
    const hasHandler =
      /export\s+(async\s+)?function\s+(handle|getStaticProps)\b/.test(text) ||
      /export\s+const\s+(handle|getStaticProps)\b/.test(text);
    if (usesCreateRoute) {
      if (/\bfetchData\s*[:(]/.test(text) && countMatches(text, CMS_READ_RE)) {
        add({
          category: 'routes',
          severity: 'suggestion',
          message:
            'createRoute() route loads CMS content in `fetchData()`. Move ' +
            'the reads to the `batchRequest()` option so they load in one ' +
            'batch with the route doc and its translations.',
          file,
          line: lineOf(text, /\bfetchData\s*[:(]/),
        });
      }
      continue;
    }
    if (usesCms && hasHandler) {
      add({
        category: 'routes',
        severity: 'suggestion',
        message:
          'Route reads CMS content in a custom `handle`/`getStaticProps`. ' +
          'Consider createRoute() from @blinkk/root-cms, which handles ' +
          'preview mode, locales, translations, 404s, caching and batched ' +
          'reads.',
        file,
        line: lineOf(
          text,
          /export\s+(async\s+)?(function|const)\s+(handle|getStaticProps)\b/
        ),
      });
    }
  }
}

function auditDataFetching(sources, add) {
  for (const {file, text} of sources) {
    if (/\.(test|spec)\.[mc]?[jt]sx?$/.test(file)) {
      continue;
    }
    // Skip node scripts and plugins that write to the CMS; they aren't page
    // rendering code.
    if (/(^|\/)(scripts|functions)\//.test(file)) {
      continue;
    }
    forEachMatch(text, V1_TRANSLATIONS_RE, (line, snippet) => {
      add({
        category: 'data-fetching',
        severity: 'action',
        message:
          'Reads the v1 translations collection. After the migration, ' +
          'translations are edited in the v2 translations manager, so this ' +
          'would serve stale strings. Load translations with a batch ' +
          'request (`addTranslations()` + `getTranslations(locale)`) or ' +
          'createRoute() instead.',
        file,
        line,
        snippet,
      });
    });
    if (
      /import\s*{[^}]*\b(getDoc|listDocs)\b[^}]*}\s*from\s*['"]@blinkk\/root-cms['"]/.test(
        text
      )
    ) {
      add({
        category: 'data-fetching',
        severity: 'suggestion',
        message:
          'Imports the deprecated `getDoc()`/`listDocs()` runtime helpers. ' +
          'Use RootCMSClient (or a batch request) instead.',
        file,
        line: lineOf(text, /\b(getDoc|listDocs)\b/),
      });
    }
    const numReads = countMatches(text, CMS_READ_RE);
    if (numReads >= 2 && !/\bcreateBatchRequest\s*\(/.test(text)) {
      add({
        category: 'data-fetching',
        severity: 'suggestion',
        message:
          `Makes ${numReads} separate CMS reads. Combine them into a batch ` +
          'request (`cmsClient.createBatchRequest()`, or the `batchRequest()` ' +
          'option of createRoute()), which fetches docs, queries, data ' +
          'sources and translations in parallel.',
        file,
        line: lineOf(text, CMS_READ_RE),
      });
    }
  }
}

/** Patterns for well-known credential formats. */
const SECRET_PATTERNS = [
  {
    name: 'Google API key (e.g. a Firebase web API key)',
    re: /AIza[0-9A-Za-z_-]{35}/g,
    severity: 'suggestion',
    note:
      'Firebase web API keys identify the project and are not secret on ' +
      'their own (access is enforced by security rules), but moving them to ' +
      'env vars keeps them out of source control and lets each environment ' +
      'use its own project.',
  },
  {name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{20,}/g},
  {name: 'OpenAI API key', re: /sk-(?:proj-)?[A-Za-z0-9]{20,}/g},
  {name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{30,}/g},
  {name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g},
  {name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/g},
  {name: 'private key', re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g},
];

/** Matches a secret-looking key assigned a string literal. */
const SECRET_ASSIGNMENT_RE =
  /\b([A-Za-z_]*(?:secret|token|password|apiKey|api_key|privateKey|private_key)[A-Za-z_]*)["']?\s*[:=]\s*(['"`])([^'"`\s]{12,})\2/gi;

function auditSecrets(rootDir, files, sources, add) {
  const configFiles = files
    .filter((file) => CONFIG_EXTS.has(path.extname(file)))
    .filter(
      (file) =>
        !/(^|\/)(package\.json|package-lock\.json|tsconfig[^/]*\.json|\.root\.secrets\.json|firebase\.json|firestore\.indexes\.json)$/.test(
          file
        ) && !/pnpm-lock\.yaml$/.test(file)
    )
    .map((file) => ({file, text: readText(path.join(rootDir, file))}))
    .filter((source) => source.text !== null);

  const seen = new Set();
  for (const {file, text} of [...sources, ...configFiles]) {
    for (const pattern of SECRET_PATTERNS) {
      forEachMatch(text, pattern.re, (line, snippet, match) => {
        const key = `${file}:${line}`;
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        add({
          category: 'secrets',
          severity: pattern.severity || 'action',
          message:
            `Hard-coded ${pattern.name}. Move it to Secret Manager with ` +
            '`root secrets` and read it from `process.env`.' +
            (pattern.note ? ` ${pattern.note}` : ''),
          file,
          line,
          snippet: redact(snippet, match[0]),
        });
      });
    }
    forEachMatch(text, SECRET_ASSIGNMENT_RE, (line, snippet, match) => {
      const key = `${file}:${line}`;
      const value = match[3];
      if (seen.has(key) || /^\{[A-Z0-9_]+\}$/.test(value)) {
        return;
      }
      // Skip env var names, references (e.g. `process.env.FOO`) and type
      // declarations (e.g. `type PasswordAlgorithm = 'pbkdf2'`).
      if (
        /^[A-Z0-9_]+$/.test(value) ||
        /^(process|import)\./.test(value) ||
        /\btype\s+\w+\s*=/.test(snippet)
      ) {
        return;
      }
      seen.add(key);
      add({
        category: 'secrets',
        severity: 'suggestion',
        message:
          `\`${match[1]}\` is set to a string literal. If it's a secret, ` +
          'move it to Secret Manager with `root secrets` and read it from ' +
          '`process.env`.',
        file,
        line,
        snippet: redact(snippet, value),
      });
    });
  }

  // `.env` files should be ignored by git, and shared with `root secrets`.
  const trackedEnvFiles = gitTrackedFiles(rootDir).filter((file) =>
    /(^|\/)\.env(\.[^/]*)?$/.test(file)
  );
  for (const file of trackedEnvFiles) {
    if (/\.(example|sample|template)$/.test(file)) {
      continue;
    }
    add({
      category: 'secrets',
      severity: 'action',
      message:
        `${file} is committed to git. Remove it from the repo, add it to ` +
        '.gitignore, and share its values with `root secrets push`.',
      file,
    });
  }
  const hasManifest = fs.existsSync(path.join(rootDir, '.root.secrets.json'));
  const envFile = readText(path.join(rootDir, '.env'));
  const envNames = new Set();
  for (const {text} of sources) {
    for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      envNames.add(match[1]);
    }
  }
  ['NODE_ENV', 'PORT', 'HOST', 'CI', 'DEBUG'].forEach((name) =>
    envNames.delete(name)
  );
  if (!hasManifest && (envFile !== null || envNames.size > 0)) {
    add({
      category: 'secrets',
      severity: 'suggestion',
      message:
        'The project reads env vars' +
        (envNames.size > 0
          ? ` (${[...envNames].sort().slice(0, 12).join(', ')})`
          : '') +
        ' but has no `.root.secrets.json`. Use `root secrets init` and ' +
        '`root secrets push` to share them through Secret Manager, so ' +
        "`root dev` syncs them into each developer's .env.",
    });
  } else if (hasManifest) {
    const manifest = readJson(path.join(rootDir, '.root.secrets.json'));
    const managed = new Set(Object.keys(manifest?.secrets || {}));
    const unmanaged = [...envNames].filter((name) => !managed.has(name));
    if (unmanaged.length > 0) {
      add({
        category: 'secrets',
        severity: 'info',
        message:
          'Env vars read by the code but not in .root.secrets.json: ' +
          `${unmanaged.sort().join(', ')}. If any are secrets that teammates ` +
          'need, add them with `root secrets set <NAME>`.',
        file: '.root.secrets.json',
      });
    }
  }
}

function auditCi(rootDir, files, add) {
  const ciFiles = files.filter((file) =>
    /(^|\/)(\.github\/workflows\/[^/]+\.ya?ml|cloudbuild[^/]*\.ya?ml|\.gitlab-ci\.yml|\.circleci\/config\.yml)$/.test(
      file
    )
  );
  for (const file of ciFiles) {
    const text = readText(path.join(rootDir, file)) || '';
    if (/\broot\s+build\b|\b(pnpm|npm|yarn)\s+(run\s+)?build\b/.test(text)) {
      add({
        category: 'ci',
        severity: 'action',
        message:
          'CI runs a build. In v4, `root build` migrates translations and ' +
          'reads Firestore before building, so the job needs Google Cloud ' +
          'credentials (application default credentials or ' +
          'GOOGLE_APPLICATION_CREDENTIALS) with access to the project.',
        file,
        line: lineOf(text, /\broot\s+build\b|\bbuild\b/),
      });
    }
  }
}

function formatAudit(findings, summary) {
  const lines = [];
  lines.push('# Root.js v4 upgrade audit');
  lines.push('');
  lines.push(
    `${summary.action} action(s), ${summary.suggestion} suggestion(s), ${summary.info} note(s).`
  );
  const categories = [
    ['packages', 'Packages and Node'],
    ['config', 'Config'],
    ['translations', 'Translations'],
    ['routes', 'CMS routes'],
    ['data-fetching', 'Data fetching'],
    ['secrets', 'Secrets'],
    ['ci', 'CI'],
  ];
  for (const [category, title] of categories) {
    const items = findings.filter((finding) => finding.category === category);
    if (items.length === 0) {
      continue;
    }
    lines.push('');
    lines.push(`## ${title}`);
    lines.push('');
    for (const item of items) {
      const loc = item.file
        ? ` (${item.file}${item.line ? `:${item.line}` : ''})`
        : '';
      lines.push(`- [${item.severity}] ${item.message}${loc}`);
      if (item.snippet) {
        lines.push(`  \`${item.snippet.replace(/`/g, "'")}\``);
      }
    }
  }
  return lines.join('\n');
}

// -----------------------------------------------------------------------------
// Snapshot.
// -----------------------------------------------------------------------------

async function snapshot({
  baseUrl,
  outDir,
  pathsFile,
  pathsFrom,
  max,
  concurrency,
}) {
  const base = new URL(baseUrl);
  let seeds = ['/'];
  let crawl = true;
  if (pathsFrom) {
    const manifest = readJson(
      path.join(path.resolve(pathsFrom), 'manifest.json')
    );
    if (!manifest) {
      fail(`no manifest.json in ${pathsFrom}`);
    }
    seeds = Object.keys(manifest.pages);
    crawl = false;
  } else if (pathsFile) {
    seeds = (readText(path.resolve(pathsFile)) || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => normalizePath(line, base))
      .filter(Boolean);
  }

  fs.mkdirSync(path.join(outDir, 'pages'), {recursive: true});
  const queue = [...new Set(seeds)];
  const queued = new Set(queue);
  const pages = {};
  let numDone = 0;
  let numInFlight = 0;

  const worker = async () => {
    // Keep polling while other workers are fetching, since their pages can
    // add more links to the queue.
    while (queue.length > 0 || numInFlight > 0) {
      if (queue.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }
      const pagePath = queue.shift();
      numInFlight++;
      const page = await fetchPage(base, pagePath).finally(() => numInFlight--);
      pages[pagePath] = page.entry;
      if (page.html !== undefined) {
        const file = path.join('pages', pageFileName(pagePath));
        fs.writeFileSync(path.join(outDir, file), page.html);
        page.entry.file = file;
      }
      numDone++;
      if (numDone % 25 === 0) {
        console.log(`  ${numDone} page(s)...`);
      }
      if (!crawl || page.html === undefined) {
        continue;
      }
      for (const link of extractLinks(page.html, new URL(pagePath, base))) {
        const linkPath = normalizePath(link, base);
        if (linkPath && !queued.has(linkPath) && queued.size < max) {
          queued.add(linkPath);
          queue.push(linkPath);
        }
      }
    }
  };
  await Promise.all(Array.from({length: concurrency}, worker));

  const sortedPages = {};
  Object.keys(pages)
    .sort()
    .forEach((pagePath) => (sortedPages[pagePath] = pages[pagePath]));
  const manifest = {
    baseUrl: base.origin,
    createdAt: new Date().toISOString(),
    pages: sortedPages,
  };
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  const statuses = {};
  Object.values(pages).forEach((page) => {
    statuses[page.status] = (statuses[page.status] || 0) + 1;
  });
  console.log(
    `Saved ${Object.keys(pages).length} page(s) to ${outDir} ` +
      `(status codes: ${Object.entries(statuses)
        .map(([status, count]) => `${status} x${count}`)
        .join(', ')})`
  );
  if (crawl && queued.size >= max) {
    console.log(
      `Stopped at --max ${max} page(s). Raise it, or pass --paths, to cover more.`
    );
  }
}

async function fetchPage(base, pagePath) {
  const url = new URL(pagePath, base);
  const startedAt = Date.now();
  const entry = {status: 0};
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {'user-agent': 'root-v4-upgrade-snapshot'},
      signal: AbortSignal.timeout(60000),
    });
    entry.status = res.status;
    entry.ms = Date.now() - startedAt;
    const location = res.headers.get('location');
    if (location) {
      entry.location = location;
    }
    entry.contentType = res.headers.get('content-type') || '';
    const cacheControl = res.headers.get('cache-control');
    if (cacheControl) {
      entry.cacheControl = cacheControl;
    }
    const body = await res.text();
    entry.bytes = body.length;
    if (entry.contentType.includes('html')) {
      return {entry, html: body};
    }
    return {entry};
  } catch (err) {
    entry.error = String(err?.message || err);
    return {entry};
  }
}

/** Returns the hrefs of links and hreflang alternates in a page. */
function extractLinks(html, pageUrl) {
  const links = [];
  const re = /<(a|link)\b[^>]*>/gi;
  for (const match of html.matchAll(re)) {
    const tag = match[0];
    if (match[1].toLowerCase() === 'link' && !/\bhreflang\s*=/i.test(tag)) {
      continue;
    }
    const href = getAttr(tag, 'href');
    if (!href) {
      continue;
    }
    try {
      links.push(new URL(decodeEntities(href), pageUrl).href);
    } catch {
      // Ignore malformed hrefs.
    }
  }
  return links;
}

/**
 * Normalizes a link to a same-origin page path, or returns null for links
 * that shouldn't be crawled (other origins, assets, the CMS, etc.).
 */
function normalizePath(link, base) {
  let url;
  try {
    url = new URL(link, base);
  } catch {
    return null;
  }
  if (url.origin !== base.origin) {
    return null;
  }
  const pathname = url.pathname;
  if (/^\/(cms|@|node_modules|__)/.test(pathname)) {
    return null;
  }
  const ext = path.posix.extname(pathname);
  if (ext && ext !== '.html') {
    return null;
  }
  return pathname;
}

function pageFileName(pagePath) {
  const name = pagePath
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_');
  return `${name || 'index'}.html`;
}

// -----------------------------------------------------------------------------
// Compare.
// -----------------------------------------------------------------------------

const SEVERITY_ORDER = ['critical', 'major', 'minor', 'ok'];

function compare({beforeDir, afterDir, outFile}) {
  const before = readJson(path.join(beforeDir, 'manifest.json'));
  const after = readJson(path.join(afterDir, 'manifest.json'));
  if (!before || !after) {
    fail('both snapshot dirs need a manifest.json (run `snapshot` first)');
  }
  const allPaths = [
    ...new Set([...Object.keys(before.pages), ...Object.keys(after.pages)]),
  ].sort();

  const results = allPaths.map((pagePath) =>
    comparePage(
      pagePath,
      before.pages[pagePath],
      after.pages[pagePath],
      beforeDir,
      afterDir
    )
  );
  results.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.path.localeCompare(b.path)
  );

  const counts = {critical: 0, major: 0, minor: 0, ok: 0};
  results.forEach((result) => counts[result.severity]++);
  const report = formatCompare(results, counts, before, after);
  if (outFile) {
    fs.mkdirSync(path.dirname(outFile), {recursive: true});
    fs.writeFileSync(outFile, report + '\n');
    fs.writeFileSync(
      outFile.replace(/\.md$/, '') + '.json',
      JSON.stringify({counts, results}, null, 2) + '\n'
    );
    console.log(`Wrote ${outFile}`);
  }
  console.log(
    `Compared ${results.length} page(s): ${counts.critical} critical, ` +
      `${counts.major} major, ${counts.minor} minor, ${counts.ok} unchanged.`
  );
  if (!outFile) {
    console.log('');
    console.log(report);
  }
}

function comparePage(pagePath, beforePage, afterPage, beforeDir, afterDir) {
  const result = {path: pagePath, severity: 'ok', changes: []};
  const flag = (severity, message, details) => {
    result.changes.push({severity, message, details});
    if (
      SEVERITY_ORDER.indexOf(severity) < SEVERITY_ORDER.indexOf(result.severity)
    ) {
      result.severity = severity;
    }
  };

  if (!afterPage) {
    flag('critical', 'Page is missing from the after snapshot.');
    return result;
  }
  if (!beforePage) {
    flag('minor', `New page (status ${afterPage.status}).`);
    return result;
  }
  if (afterPage.error || beforePage.error) {
    if (afterPage.error && !beforePage.error) {
      flag('critical', `Request failed: ${afterPage.error}`);
    }
    return result;
  }
  if (beforePage.status !== afterPage.status) {
    const isError = afterPage.status >= 400 || afterPage.status === 0;
    flag(
      isError ? 'critical' : 'major',
      `Status changed: ${beforePage.status} -> ${afterPage.status}.`
    );
    // The page's content is gone, so diffing its HTML only adds noise.
    if (isError) {
      return result;
    }
  }
  if ((beforePage.location || '') !== (afterPage.location || '')) {
    flag(
      'major',
      `Redirect changed: ${beforePage.location || '(none)'} -> ${afterPage.location || '(none)'}.`
    );
  }
  if ((beforePage.cacheControl || '') !== (afterPage.cacheControl || '')) {
    flag(
      'minor',
      `Cache-Control changed: ${beforePage.cacheControl || '(none)'} -> ${afterPage.cacheControl || '(none)'}.`
    );
  }
  if (!beforePage.file || !afterPage.file) {
    return result;
  }

  const a = analyzeHtml(readText(path.join(beforeDir, beforePage.file)) || '');
  const b = analyzeHtml(readText(path.join(afterDir, afterPage.file)) || '');

  for (const field of ['lang', 'title', 'description', 'canonical', 'robots']) {
    if (a[field] !== b[field]) {
      flag(field === 'description' ? 'minor' : 'major', `<${field}> changed.`, [
        `- ${a[field] ?? '(none)'}`,
        `+ ${b[field] ?? '(none)'}`,
      ]);
    }
  }
  const hreflangDiff = diffSets(a.hreflang, b.hreflang);
  if (hreflangDiff.length > 0) {
    flag('major', 'hreflang alternates changed.', hreflangDiff);
  }

  const headingDiff = diffLines(a.headings, b.headings);
  if (headingDiff.changed) {
    flag('major', 'Headings changed.', headingDiff.lines);
  }

  const textDiff = diffLines(a.text, b.text);
  if (textDiff.changed) {
    const similarity = textDiff.similarity;
    const pct = `${(similarity * 100).toFixed(1)}%`;
    flag(
      similarity < 0.9 ? 'major' : 'minor',
      `Visible text changed (${pct} similar, ${textDiff.removed} line(s) removed, ${textDiff.added} added).`,
      textDiff.lines
    );
  }

  const linkDiff = diffSets(a.links, b.links);
  if (linkDiff.length > 0) {
    flag('minor', `Links changed (${linkDiff.length}).`, linkDiff);
  }
  const imageDiff = diffSets(a.images, b.images);
  if (imageDiff.length > 0) {
    flag('minor', `Images changed (${imageDiff.length}).`, imageDiff);
  }

  // A large change in the number of elements usually means a component
  // stopped (or started) rendering.
  const delta = Math.abs(a.numElements - b.numElements);
  if (delta > Math.max(20, a.numElements * 0.1)) {
    flag(
      'major',
      `Element count changed: ${a.numElements} -> ${b.numElements}.`
    );
  }
  return result;
}

/** Extracts the parts of a page that are compared. */
function analyzeHtml(html) {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '');
  const head = (stripped.match(/<head\b[\s\S]*?<\/head>/i) || [''])[0];
  const body = (stripped.match(/<body\b[\s\S]*<\/body>/i) || [stripped])[0];

  const metaContent = (name) => {
    for (const match of head.matchAll(/<meta\b[^>]*>/gi)) {
      const tag = match[0];
      const key = getAttr(tag, 'name') || getAttr(tag, 'property');
      if (key && key.toLowerCase() === name) {
        return cleanText(getAttr(tag, 'content') || '');
      }
    }
    return undefined;
  };
  const linkHref = (rel) => {
    for (const match of head.matchAll(/<link\b[^>]*>/gi)) {
      const tag = match[0];
      if ((getAttr(tag, 'rel') || '').toLowerCase() === rel) {
        return getAttr(tag, 'href');
      }
    }
    return undefined;
  };

  const hreflang = [];
  for (const match of stripped.matchAll(/<link\b[^>]*\bhreflang\s*=[^>]*>/gi)) {
    hreflang.push(
      `${getAttr(match[0], 'hreflang')} ${normalizeAssetUrl(getAttr(match[0], 'href') || '')}`
    );
  }

  const headings = [];
  for (const match of body.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    headings.push(
      `${match[1].toLowerCase()}: ${cleanText(stripTags(match[2]))}`
    );
  }

  const links = [];
  for (const match of body.matchAll(/<a\b[^>]*>/gi)) {
    const href = getAttr(match[0], 'href');
    if (href) {
      links.push(normalizeAssetUrl(href));
    }
  }
  const images = [];
  for (const match of body.matchAll(/<(img|source)\b[^>]*>/gi)) {
    const src = getAttr(match[0], 'src') || getAttr(match[0], 'srcset');
    if (src) {
      images.push(normalizeAssetUrl(src.split(/[\s,]/)[0]));
    }
  }

  const text = body
    .replace(
      /<\/?(p|div|section|article|header|footer|nav|main|aside|li|ul|ol|h[1-6]|br|tr|td|th|table|blockquote|figure|figcaption|form|label|button|option)\b[^>]*>/gi,
      '\n'
    )
    .split('\n')
    .map((line) => cleanText(stripTags(line)))
    .filter(Boolean);

  const numElements = (body.match(/<[a-zA-Z][^>]*>/g) || []).length;
  const htmlTag = (html.match(/<html\b[^>]*>/i) || [''])[0];
  const title = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return {
    lang: getAttr(htmlTag, 'lang'),
    title: title ? cleanText(title[1]) : undefined,
    description: metaContent('description'),
    robots: metaContent('robots'),
    canonical: linkHref('canonical'),
    hreflang,
    headings,
    links,
    images,
    text,
    numElements,
  };
}

/** Strips build hashes from asset URLs, e.g. `main-a1b2c3d4.js` -> `main.js`. */
function normalizeAssetUrl(url) {
  return decodeEntities(url).replace(
    /[-.][A-Za-z0-9_-]{8,}(\.(?:m?js|css|woff2?|ttf|svg|png|jpe?g|webp|avif|gif))/g,
    '$1'
  );
}

/** Returns `- removed` / `+ added` lines for two lists, ignoring order. */
function diffSets(before, after) {
  const count = (items) => {
    const counts = new Map();
    items.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
    return counts;
  };
  const a = count(before);
  const b = count(after);
  const lines = [];
  for (const [item, n] of a) {
    if ((b.get(item) || 0) < n) {
      lines.push(`- ${item}`);
    }
  }
  for (const [item, n] of b) {
    if ((a.get(item) || 0) < n) {
      lines.push(`+ ${item}`);
    }
  }
  return lines;
}

/** Max number of LCS table cells, to keep the line diff fast. */
const MAX_LCS_CELLS = 4_000_000;

/**
 * Diffs two lists of lines. Returns the removed and added lines (in order),
 * and a similarity score from 0 to 1.
 */
function diffLines(before, after) {
  // Trim the common prefix and suffix, which is most of an unchanged page.
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  ) {
    start++;
  }
  let endA = before.length;
  let endB = after.length;
  while (endA > start && endB > start && before[endA - 1] === after[endB - 1]) {
    endA--;
    endB--;
  }
  const a = before.slice(start, endA);
  const b = after.slice(start, endB);
  if (a.length === 0 && b.length === 0) {
    return {changed: false, similarity: 1, removed: 0, added: 0, lines: []};
  }

  let ops;
  if (a.length * b.length <= MAX_LCS_CELLS) {
    ops = lcsDiff(a, b);
  } else {
    // Too large for a line diff, so fall back to comparing sets of lines.
    ops = diffSets(a, b).map((line) => ({
      op: line[0] === '-' ? '-' : '+',
      line: line.slice(2),
    }));
  }
  const removed = ops.filter((op) => op.op === '-').length;
  const added = ops.filter((op) => op.op === '+').length;
  const total = before.length + after.length;
  const common = total - removed - added;
  return {
    changed: removed + added > 0,
    similarity: total === 0 ? 1 : common / total,
    removed,
    added,
    lines: ops.map((op) => `${op.op} ${op.line}`),
  };
}

/** Returns the removed (`-`) and added (`+`) lines using an LCS table. */
function lcsDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const table = Array.from({length: n + 1}, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({op: '-', line: a[i++]});
    } else {
      ops.push({op: '+', line: b[j++]});
    }
  }
  while (i < n) {
    ops.push({op: '-', line: a[i++]});
  }
  while (j < m) {
    ops.push({op: '+', line: b[j++]});
  }
  return ops;
}

/** Max number of detail lines shown per change in the report. */
const MAX_DETAIL_LINES = 12;

function formatCompare(results, counts, before, after) {
  const lines = [];
  lines.push('# Root.js v4 upgrade: before/after comparison');
  lines.push('');
  lines.push(`- Before: ${before.baseUrl} at ${before.createdAt}`);
  lines.push(`- After: ${after.baseUrl} at ${after.createdAt}`);
  lines.push('');
  lines.push('| Severity | Pages |');
  lines.push('| --- | --- |');
  for (const severity of SEVERITY_ORDER) {
    lines.push(`| ${severity} | ${counts[severity]} |`);
  }
  lines.push('');
  lines.push(
    'Expected differences are ignored: asset hashes, scripts and styles ' +
      '(including the `modulepreload` tags v4 adds), and whitespace. Content ' +
      'published between the two snapshots also shows up as a change.'
  );
  for (const result of results) {
    if (result.severity === 'ok') {
      continue;
    }
    lines.push('');
    lines.push(`## [${result.severity}] ${result.path}`);
    for (const change of result.changes) {
      lines.push('');
      lines.push(`- [${change.severity}] ${change.message}`);
      if (change.details && change.details.length > 0) {
        lines.push('');
        lines.push('  ```diff');
        change.details.slice(0, MAX_DETAIL_LINES).forEach((line) => {
          lines.push(`  ${truncate(line, 200)}`);
        });
        if (change.details.length > MAX_DETAIL_LINES) {
          lines.push(`  ... ${change.details.length - MAX_DETAIL_LINES} more`);
        }
        lines.push('  ```');
      }
    }
  }
  return lines.join('\n');
}

// -----------------------------------------------------------------------------
// Utils.
// -----------------------------------------------------------------------------

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function readJson(filePath) {
  const text = readText(filePath);
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Lists the project's files (relative paths), skipping ignored dirs. */
function listFiles(rootDir) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(rootDir, dir), {withFileTypes: true});
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walk(rel);
        }
      } else if (entry.isFile()) {
        const stat = fs.statSync(path.join(rootDir, rel));
        // Skip large (likely generated) files.
        if (stat.size < 1024 * 1024) {
          files.push(rel);
        }
      }
    }
  };
  walk('');
  return files;
}

function gitTrackedFiles(rootDir) {
  try {
    return execFileSync('git', ['ls-files'], {cwd: rootDir, encoding: 'utf8'})
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseMajor(version) {
  const match = String(version || '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

/** Calls `fn(line, snippet, match)` for each match of `re` in `text`. */
function forEachMatch(text, re, fn) {
  const globalRe = new RegExp(
    re.source,
    re.flags.includes('g') ? re.flags : re.flags + 'g'
  );
  for (const match of text.matchAll(globalRe)) {
    const line = text.slice(0, match.index).split('\n').length;
    const snippet = text.split('\n')[line - 1].trim();
    fn(line, truncate(snippet, 160), match);
  }
}

function countMatches(text, re) {
  const globalRe = new RegExp(
    re.source,
    re.flags.includes('g') ? re.flags : re.flags + 'g'
  );
  return [...text.matchAll(globalRe)].length;
}

/** Returns the 1-based line of the first match of `re`, if any. */
function lineOf(text, re) {
  const match = new RegExp(re.source, re.flags.replace('g', '')).exec(text);
  return match ? text.slice(0, match.index).split('\n').length : undefined;
}

/** Replaces a secret in a snippet with its first 4 characters and asterisks. */
function redact(snippet, secret) {
  if (!secret) {
    return snippet;
  }
  const masked = `${secret.slice(0, 4)}${'*'.repeat(8)}`;
  return snippet.split(secret).join(masked);
}

function getAttr(tag, name) {
  const re = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i'
  );
  const match = tag.match(re);
  if (!match) {
    return undefined;
  }
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '');
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, ' ');
}

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  copy: '©',
  reg: '®',
  trade: '™',
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === '#') {
      const num =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : entity;
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}

function cleanText(text) {
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});
