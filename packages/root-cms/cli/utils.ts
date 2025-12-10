/**
 * Parses a comma-separated filter string into include and exclude patterns.
 * Exclude patterns are prefixed with "!".
 */
export function parseFilters(filterStr?: string): {
  includes: string[];
  excludes: string[];
} {
  if (!filterStr) {
    return {includes: [], excludes: []};
  }
  const parts = filterStr
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const includes = parts.filter((p) => !p.startsWith('!'));
  const excludes = parts
    .filter((p) => p.startsWith('!'))
    .map((p) => p.slice(1));
  return {includes, excludes};
}

export type PathStatus = 'INCLUDE' | 'TRAVERSE' | 'SKIP' | 'EXCLUDE';

/**
 * Determines the status of a path against a set of include and exclude patterns.
 *
 * - `EXCLUDE`: Path matches an exclude pattern.
 * - `INCLUDE`: Path matches an include pattern fully.
 * - `TRAVERSE`: Path is a parent of an include pattern (partial match).
 * - `SKIP`: Path does not match any include pattern and is not a parent of one.
 */
export function getPathStatus(
  path: string,
  includes: string[],
  excludes: string[]
): PathStatus {
  // Check excludes first.
  for (const pattern of excludes) {
    if (globMatch(path, pattern)) {
      return 'EXCLUDE';
    }
  }

  // If no include patterns are provided, everything is included (unless excluded).
  if (includes.length === 0) {
    return 'INCLUDE';
  }

  let isIncluded = false;
  let shouldTraverse = false;

  for (const pattern of includes) {
    const match = checkMatch(path, pattern);
    if (match === 'FULL') {
      isIncluded = true;
    } else if (match === 'PARTIAL') {
      shouldTraverse = true;
    }
  }

  if (isIncluded) {
    return 'INCLUDE';
  }
  if (shouldTraverse) {
    return 'TRAVERSE';
  }
  return 'SKIP';
}

/**
 * Checks if a path fully matches a glob pattern.
 */
function globMatch(path: string, pattern: string): boolean {
  return checkMatch(path, pattern) === 'FULL';
}

/**
 * Checks how a path matches a pattern.
 *
 * - `FULL`: The path matches the pattern exactly.
 * - `PARTIAL`: The path is a parent directory of the pattern (e.g. path="foo", pattern="foo/bar").
 * - `NONE`: No match.
 */
function checkMatch(
  path: string,
  pattern: string
): 'FULL' | 'PARTIAL' | 'NONE' {
  const pathParts = path.split('/');
  const patternParts = pattern.split('/');

  // Check for FULL match.
  if (matchSegments(pathParts, patternParts)) {
    return 'FULL';
  }

  // Check for PARTIAL match (path is a parent of the pattern).
  if (pathParts.length < patternParts.length) {
    const patternPrefix = patternParts.slice(0, pathParts.length);
    if (matchSegments(pathParts, patternPrefix)) {
      return 'PARTIAL';
    }
  }

  return 'NONE';
}

/**
 * Helper to match path segments against pattern segments.
 * Supports `*` (single segment wildcard) and `**` (recursive wildcard at the end).
 */
function matchSegments(pathParts: string[], patternParts: string[]): boolean {
  // Handle ** at the end.
  if (patternParts[patternParts.length - 1] === '**') {
    const basePattern = patternParts.slice(0, -1);
    if (pathParts.length < basePattern.length) {
      return false;
    }
    // Check if the base matches.
    return matchSegments(pathParts.slice(0, basePattern.length), basePattern);
  }

  if (pathParts.length !== patternParts.length) {
    return false;
  }

  for (let i = 0; i < pathParts.length; i++) {
    const pathPart = pathParts[i];
    const patternPart = patternParts[i];

    if (patternPart === '*') {
      continue;
    }
    if (pathPart !== patternPart) {
      return false;
    }
  }

  return true;
}

export type LimitFunction = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Creates a concurrency limiter.
 */
export function pLimit(concurrency: number): LimitFunction {
  const queue: (() => void)[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const job = queue.shift();
      if (job) job();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    }

    activeCount++;

    try {
      return await fn();
    } finally {
      next();
    }
  };
}
