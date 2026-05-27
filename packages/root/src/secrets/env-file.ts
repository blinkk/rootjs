import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

/**
 * Reads a `.env` file, returning an empty string if it doesn't exist. Other
 * read errors propagate.
 */
export async function readEnvFile(envPath: string): Promise<string> {
  try {
    return await fs.promises.readFile(envPath, 'utf8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return '';
    }
    throw err;
  }
}

/**
 * Atomically writes `.env` content via a temp file + rename so a crash mid-write
 * can never leave a partially written `.env`.
 */
export async function writeEnvFile(
  envPath: string,
  content: string
): Promise<void> {
  const dir = path.dirname(envPath);
  await fs.promises.mkdir(dir, {recursive: true});
  const tmp = path.join(dir, `.env.tmp-${process.pid}-${Date.now()}`);
  await fs.promises.writeFile(tmp, content, 'utf8');
  await fs.promises.rename(tmp, envPath);
}

/**
 * Parses `.env` content into a key/value map using the same parser the CLI uses
 * to load env vars at startup (`dotenv`), so values compared here match what the
 * running process sees.
 */
export function parseEnv(content: string): Record<string, string> {
  return dotenv.parse(content);
}

/**
 * Serializes a value into a `.env`-safe, single-physical-line representation
 * that round-trips through `dotenv.parse`.
 *
 * Prefers single quotes, which dotenv treats as fully literal — so backslashes,
 * tabs, double-quotes, `#`, `=`, and spaces all survive untouched. Values that
 * contain a single-quote or a newline fall back to double quotes, where dotenv
 * only un-escapes `\n` and `\r`; those are escaped (collapsing multi-line values
 * onto one line) and embedded double-quotes are escaped for parse-safety.
 *
 * Known limitation (inherited from dotenv): a value containing BOTH a single and
 * a double quote, or a literal backslash adjacent to `n`/`r`, may not round-trip
 * exactly. Such values are vanishingly rare for secrets.
 */
export function serializeEnvValue(value: string): string {
  if (!value.includes("'") && !value.includes('\n') && !value.includes('\r')) {
    return `'${value}'`;
  }
  const escaped = value
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Upserts and/or removes the given keys in `.env` content, preserving every
 * other line (comments, blank lines, unmanaged vars) and the file's dominant
 * EOL.
 *
 * - Keys in `updates` replace an existing assignment in place (first occurrence;
 *   later duplicates of the same key are dropped) or are appended if absent.
 * - Keys in `removals` are deleted.
 *
 * All managed values are written as single physical lines (see
 * `serializeEnvValue`), so a simple per-line scan is sufficient and safe.
 */
export function upsertEnvVars(
  content: string,
  updates: Record<string, string>,
  removals: string[] = []
): string {
  const eol = detectEol(content);
  const removeSet = new Set(removals);
  const written = new Set<string>();
  const lines = content.length ? content.split(/\r?\n/) : [];
  // A trailing newline yields a phantom empty final element; drop it so appended
  // keys don't land after a blank line.
  if (
    lines.length > 0 &&
    lines[lines.length - 1] === '' &&
    /\r?\n$/.test(content)
  ) {
    lines.pop();
  }
  const out: string[] = [];

  for (const line of lines) {
    const key = parseAssignmentKey(line);
    if (key && removeSet.has(key)) {
      continue;
    }
    if (key && Object.prototype.hasOwnProperty.call(updates, key)) {
      if (!written.has(key)) {
        out.push(`${key}=${serializeEnvValue(updates[key])}`);
        written.add(key);
      }
      continue;
    }
    out.push(line);
  }

  for (const key of Object.keys(updates)) {
    if (!written.has(key)) {
      out.push(`${key}=${serializeEnvValue(updates[key])}`);
      written.add(key);
    }
  }

  // Drop trailing blank lines, then terminate with a single EOL.
  while (out.length > 0 && out[out.length - 1].trim() === '') {
    out.pop();
  }
  if (out.length === 0) {
    return '';
  }
  return out.join(eol) + eol;
}

/** Extracts the variable name from an assignment line, or null if not one. */
function parseAssignmentKey(line: string): string | null {
  const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=/);
  return match ? match[1] : null;
}

/** Returns the dominant line ending of existing content (`\r\n` vs `\n`). */
function detectEol(content: string): string {
  const crlf = (content.match(/\r\n/g) || []).length;
  const lf = (content.match(/\n/g) || []).length - crlf;
  return crlf > lf ? '\r\n' : '\n';
}
