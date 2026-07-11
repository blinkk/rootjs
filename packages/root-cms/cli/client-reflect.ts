import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Metadata about a single public method on `RootCMSClient`. */
export interface ClientMethodInfo {
  /** Method name, e.g. "getDoc". */
  name: string;
  /**
   * Full TypeScript signature (without the trailing semicolon), e.g.
   * `getDoc(collectionId: string, slug: string, options: GetDocOptions): Promise<Doc<Fields> | null>`.
   */
  signature: string;
  /** JSDoc description, if any. */
  description: string;
}

/** A top-level type/interface declaration referenced by the client API. */
export interface ClientTypeInfo {
  /** Type name, e.g. "GetDocOptions". */
  name: string;
  /** Full declaration text (interface/type/enum body). */
  declaration: string;
  /** JSDoc description, if any. */
  description: string;
}

export interface ClientApiInfo {
  methods: ClientMethodInfo[];
  types: ClientTypeInfo[];
}

let cachedApiInfo: ClientApiInfo | null = null;

/**
 * Reads and parses the shipped `client.d.ts` type declarations to build a
 * catalog of the public RootCMSClient methods and referenced types.
 */
export function getClientApiInfo(): ClientApiInfo {
  if (cachedApiInfo) {
    return cachedApiInfo;
  }
  const src = readClientDts();
  cachedApiInfo = parseClientDts(src);
  return cachedApiInfo;
}

/**
 * Locates and reads the generated `client.d.ts` file. The file is shipped as
 * part of the package's `dist/` output. The CLI may run from `dist/cli.js` or
 * from a bundled chunk in `dist/`, so a few candidate locations are checked.
 */
function readClientDts(): string {
  const candidates = [
    path.resolve(__dirname, 'core/client.d.ts'),
    path.resolve(__dirname, '../core/client.d.ts'),
    path.resolve(__dirname, '../dist/core/client.d.ts'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8');
    }
  }
  throw new Error(
    `could not locate client.d.ts (looked in: ${candidates.join(', ')})`
  );
}

/**
 * Parses a `client.d.ts` source string into method and type metadata.
 */
export function parseClientDts(src: string): ClientApiInfo {
  const lines = src.split('\n');
  const methods = parseClassMethods(lines);
  const types = parseTopLevelTypes(lines);
  return {methods, types};
}

/**
 * Extracts public method metadata from the `RootCMSClient` class body.
 */
function parseClassMethods(lines: string[]): ClientMethodInfo[] {
  const classStart = lines.findIndex((line) =>
    /^export declare class RootCMSClient\b/.test(line.trim())
  );
  if (classStart === -1) {
    return [];
  }
  // Find the matching closing brace at column 0.
  let classEnd = lines.length;
  for (let i = classStart + 1; i < lines.length; i++) {
    if (/^}/.test(lines[i])) {
      classEnd = i;
      break;
    }
  }

  const methods: ClientMethodInfo[] = [];
  let pendingDoc = '';
  let i = classStart + 1;
  while (i < classEnd) {
    const trimmed = lines[i].trim();

    // Collect JSDoc comment blocks.
    if (trimmed.startsWith('/**')) {
      const {doc, next} = collectJsDoc(lines, i, classEnd);
      pendingDoc = doc;
      i = next;
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('//')) {
      i++;
      continue;
    }

    // Collect a full member declaration (may span multiple lines).
    const {text, next} = collectDeclaration(lines, i, classEnd);
    i = next;

    const doc = pendingDoc;
    pendingDoc = '';

    // Skip private members and non-method members (properties, constructor).
    if (
      text.startsWith('private ') ||
      text.startsWith('constructor') ||
      text.startsWith('readonly ') ||
      text.startsWith('static ')
    ) {
      continue;
    }
    // A method has a parameter list; properties do not.
    const nameMatch = text.match(/^([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/);
    if (!nameMatch) {
      continue;
    }
    const name = nameMatch[1];
    const signature = text.replace(/;\s*$/, '');
    methods.push({name, signature, description: doc});
  }

  return methods;
}

/**
 * Extracts top-level exported interface/type/enum declarations.
 */
function parseTopLevelTypes(lines: string[]): ClientTypeInfo[] {
  const types: ClientTypeInfo[] = [];
  let pendingDoc = '';
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed.startsWith('/**')) {
      const {doc, next} = collectJsDoc(lines, i, lines.length);
      pendingDoc = doc;
      i = next;
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*')) {
      i++;
      continue;
    }

    const interfaceMatch = trimmed.match(
      /^export (?:declare )?interface ([A-Za-z_$][\w$]*)/
    );
    const typeMatch = trimmed.match(
      /^export (?:declare )?type ([A-Za-z_$][\w$]*)/
    );
    const enumMatch = trimmed.match(
      /^export (?:declare )?enum ([A-Za-z_$][\w$]*)/
    );

    if (interfaceMatch || enumMatch) {
      // Block declaration terminated by a closing brace at column 0.
      const start = i;
      let end = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^}/.test(lines[j])) {
          end = j;
          break;
        }
      }
      const declaration = lines.slice(start, end + 1).join('\n');
      types.push({
        name: (interfaceMatch || enumMatch)![1],
        declaration,
        description: pendingDoc,
      });
      pendingDoc = '';
      i = end + 1;
      continue;
    }

    if (typeMatch) {
      // Type alias terminated by a line ending in ';'.
      const start = i;
      let end = i;
      for (let j = i; j < lines.length; j++) {
        if (/;\s*$/.test(lines[j])) {
          end = j;
          break;
        }
      }
      const declaration = lines.slice(start, end + 1).join('\n');
      types.push({
        name: typeMatch[1],
        declaration,
        description: pendingDoc,
      });
      pendingDoc = '';
      i = end + 1;
      continue;
    }

    pendingDoc = '';
    i++;
  }

  return types;
}

/**
 * Collects a JSDoc comment block starting at `start`, returning the cleaned
 * description text and the index of the line after the block.
 */
function collectJsDoc(
  lines: string[],
  start: number,
  end: number
): {doc: string; next: number} {
  const docLines: string[] = [];
  let i = start;
  while (i < end) {
    const raw = lines[i];
    const closed = raw.includes('*/');
    let content = raw.trim();
    content = content.replace(/^\/\*\*/, '').replace(/\*\/\s*$/, '');
    content = content.replace(/^\*\s?/, '');
    docLines.push(content);
    i++;
    if (closed) {
      break;
    }
  }
  const doc = docLines
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
    .trim();
  return {doc, next: i};
}

/**
 * Collects a full member declaration starting at `start`. Handles declarations
 * that span multiple lines (e.g. inline object types) by balancing brackets
 * until the terminating semicolon is reached.
 */
function collectDeclaration(
  lines: string[],
  start: number,
  end: number
): {text: string; next: number} {
  let depth = 0;
  const parts: string[] = [];
  let i = start;
  while (i < end) {
    const line = lines[i];
    parts.push(line.trim());
    for (const ch of line) {
      if (ch === '(' || ch === '{' || ch === '[') {
        depth++;
      } else if (ch === ')' || ch === '}' || ch === ']') {
        depth--;
      }
    }
    i++;
    if (depth <= 0 && /;\s*$/.test(line)) {
      break;
    }
  }
  return {text: parts.join(' ').replace(/\s+/g, ' ').trim(), next: i};
}
