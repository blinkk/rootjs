/**
 * Fails the build when the CMS UI's startup bundle regresses. Everything `ui.js`
 * statically imports loads on every page before anything renders, so heavy
 * dependencies need to stay behind a dynamic `import()`.
 *
 * Usage: node scripts/check-ui-bundle.ts
 */

import {readFile} from 'node:fs/promises';
import path from 'node:path';

const METAFILE = path.resolve(import.meta.dirname, '../dist/ui-meta.json');

/** Packages that must not load at startup. */
const BANNED_PACKAGES = [
  '@ag-grid-community',
  '@ai-sdk',
  '@hello-pangea/dnd',
  '@lexical',
  'ai',
  'lexical',
  'marked',
  'sanitize-html',
  'zod',
];

/**
 * AI provider SDKs. A project usually uses just one, so `shared/ai/models.ts`
 * imports them on demand, and no chunk may statically load more than one.
 */
const AI_PROVIDER_PACKAGES = [
  '@ai-sdk/anthropic',
  '@ai-sdk/google',
  '@ai-sdk/openai',
  '@ai-sdk/openai-compatible',
];

/** Max uncompressed size of `ui.js` and everything it statically imports. */
const MAX_STARTUP_BYTES = 1000 * 1024;

interface Metafile {
  outputs: Record<
    string,
    {
      bytes: number;
      imports: Array<{path: string; kind: string}>;
      inputs: Record<string, unknown>;
    }
  >;
}

/** Returns the output files that load with `entry`. */
function getStaticClosure(meta: Metafile, entry: string): Set<string> {
  const closure = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const output = queue.pop()!;
    if (closure.has(output)) {
      continue;
    }
    closure.add(output);
    for (const dep of meta.outputs[output].imports) {
      if (dep.kind === 'import-statement' && meta.outputs[dep.path]) {
        queue.push(dep.path);
      }
    }
  }
  return closure;
}

/** Returns the npm package an input file belongs to, if any. */
function getPackageName(input: string): string | null {
  const match = input.match(/.*node_modules\/((?:@[^/]+\/)?[^/]+)/);
  return match ? match[1] : null;
}

const meta: Metafile = JSON.parse(await readFile(METAFILE, 'utf8'));
const entry = Object.keys(meta.outputs).find((output) =>
  output.endsWith('/ui.js')
);
if (!entry) {
  throw new Error(`no ui.js in ${METAFILE}`);
}

const closure = getStaticClosure(meta, entry);
const errors: string[] = [];
const banned = new Set<string>();
let startupBytes = 0;
for (const output of closure) {
  startupBytes += meta.outputs[output].bytes;
  for (const input of Object.keys(meta.outputs[output].inputs)) {
    const name = getPackageName(input);
    if (
      name &&
      BANNED_PACKAGES.some((pkg) => name === pkg || name.startsWith(`${pkg}/`))
    ) {
      banned.add(name);
    }
  }
}
if (banned.size > 0) {
  errors.push(
    `these packages must load lazily, but ui.js statically imports them: ${[
      ...banned,
    ].join(', ')}`
  );
}
if (startupBytes > MAX_STARTUP_BYTES) {
  errors.push(
    `the startup bundle is ${Math.round(startupBytes / 1024)} KB, over the ${
      MAX_STARTUP_BYTES / 1024
    } KB limit`
  );
}

for (const output of Object.keys(meta.outputs)) {
  const providers = new Set<string>();
  for (const file of getStaticClosure(meta, output)) {
    for (const input of Object.keys(meta.outputs[file].inputs)) {
      const name = getPackageName(input);
      if (name && AI_PROVIDER_PACKAGES.includes(name)) {
        providers.add(name);
      }
    }
  }
  if (providers.size > 1) {
    errors.push(
      `${path.basename(output)} statically imports multiple ai providers: ${[
        ...providers,
      ].join(', ')}`
    );
    break;
  }
}

if (errors.length > 0) {
  console.error('ui bundle check failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  console.error(
    'load heavy code with a dynamic import(), and import a modal through its useXModal hook.'
  );
  process.exit(1);
}
console.log(
  `ui startup bundle: ${Math.round(startupBytes / 1024)} KB in ${closure.size} files`
);
