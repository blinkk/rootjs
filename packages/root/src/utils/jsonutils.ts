/**
 * Normalizes line endings in a string to LF (`\n`).
 *
 * Converts CRLF (`\r\n`) and lone CR (`\r`) to LF.
 */
export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizeData(value: unknown): unknown {
  if (typeof value === 'string') {
    return normalizeLineEndings(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeData);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      result[key] = normalizeData((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

export interface JsonStringifyOptions {
  /**
   * Indentation passed through to `JSON.stringify`. Accepts a number of
   * spaces or an indent string.
   */
  indent?: number | string;
}

/**
 * Serializes data to a JSON string with Unix (LF) line endings.
 *
 * Unlike `JSON.stringify()`, this:
 * - Recursively normalizes `\r\n` and `\r` to `\n` in string values, so
 *   round-tripping through `JSON.parse` won't yield CRLF line endings.
 * - Normalizes line endings in the resulting JSON string itself.
 */
export function jsonStringify(
  value: unknown,
  options?: JsonStringifyOptions
): string {
  const normalized = normalizeData(value);
  const serialized = JSON.stringify(normalized, null, options?.indent);
  return normalizeLineEndings(serialized);
}
