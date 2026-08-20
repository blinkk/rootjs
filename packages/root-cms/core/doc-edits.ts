/**
 * The deterministic doc-edit engine shared by the `doc_edit` AI tool, the CMS
 * change-proposal applier, and the proposal read overlay.
 *
 * Kept separate from `ai-tools.ts` so callers can apply edits without pulling
 * the Vercel AI SDK into their bundle — `core/client.ts` is its own build
 * entry point and must stay lightweight.
 */
import type {ValidationError} from './validation.js';

/** Validates the syntax of a dotted field path. */
export function validatePathSyntax(path: string): ValidationError | null {
  const trimmed = path.trim();
  if (!trimmed) {
    return createPathError(
      path,
      'Path is required and must be relative to the doc fields object.',
      'non-empty field path',
      path
    );
  }

  const segments = trimmed.split('.');
  if (segments.some((segment) => segment.length === 0)) {
    return createPathError(
      path,
      'Path must use dotted field segments without empty segments.',
      'dotted field path',
      path
    );
  }

  if (segments[0] === 'fields') {
    return createPathError(
      path,
      'Path must be relative to the fields object; remove the leading "fields." prefix.',
      'field path without fields prefix',
      path
    );
  }

  if (segments.some((segment) => /[[\]]/.test(segment))) {
    return createPathError(
      path,
      'Use dotted zero-based array indices, e.g. "content.modules.0.title".',
      'dotted array index path',
      path
    );
  }

  return null;
}

/** Builds a `ValidationError` describing a bad field path. */
export function createPathError(
  path: string,
  message: string,
  expected: string,
  received: any
): ValidationError {
  return {
    path,
    message,
    expected,
    received,
  };
}

/** A single edit operation handled by the `doc_edit` tool. */
export interface DocEditOperation {
  op: 'set' | 'insert_item' | 'remove_item';
  /** Dotted path within the fields object (no leading "fields." prefix). */
  path: string;
  /** Value to write ("set") or insert ("insert_item"). Unused for "remove_item". */
  value?: any;
  /** Zero-based array index for "insert_item" (optional) and "remove_item" (required). */
  index?: number;
}

/** A structural failure applying one operation in a `doc_edit` batch. */
export interface DocEditError {
  /** Zero-based position of the failing operation in the input list. */
  opIndex: number;
  op: string;
  path: string;
  message: string;
  expected?: string;
  received?: any;
}

export type ApplyDocEditsResult =
  | {ok: true; fields: Record<string, any>}
  | {ok: false; error: DocEditError};

const INDEX_RE = /^(0|[1-9]\d*)$/;

/**
 * Applies a sequence of `doc_edit` operations to a plain-JSON `fields` object
 * and returns the resulting fields, or the first operation that failed.
 *
 * Pure: the input is deep-cloned and never mutated, so callers can validate
 * the result against the collection schema (via `validateFields`) before
 * persisting. Operations run in order — array indices in each op refer to the
 * array state after earlier ops have been applied.
 *
 * This performs structural checks only (path resolves against the current
 * data, the target is an array for insert_item/remove_item, the index is in
 * range). Type/schema validation is the caller's responsibility.
 */
export function applyDocEdits(
  fields: Record<string, any>,
  operations: DocEditOperation[]
): ApplyDocEditsResult {
  const draft: Record<string, any> = JSON.parse(JSON.stringify(fields ?? {}));
  for (let i = 0; i < operations.length; i++) {
    const error = applyOneEdit(draft, operations[i], i);
    if (error) {
      return {ok: false, error};
    }
  }
  return {ok: true, fields: draft};
}

function applyOneEdit(
  draft: Record<string, any>,
  op: DocEditOperation,
  opIndex: number
): DocEditError | null {
  if (op.op !== 'set' && op.op !== 'insert_item' && op.op !== 'remove_item') {
    return makeEditError(
      opIndex,
      op,
      typeof op.path === 'string' ? op.path : String(op.path),
      `Unknown operation "${op.op}".`,
      'set | insert_item | remove_item',
      op.op
    );
  }

  if (typeof op.path !== 'string') {
    return makeEditError(
      opIndex,
      op,
      String(op.path),
      'Operation `path` must be a string.',
      'string',
      typeName(op.path)
    );
  }

  const syntax = validatePathSyntax(op.path);
  if (syntax) {
    return {opIndex, op: op.op, ...syntax};
  }
  const segments = op.path.trim().split('.');
  const lastSeg = segments[segments.length - 1];
  const childPath = op.path.trim();
  const lastIsIndex = INDEX_RE.test(lastSeg);

  // For "remove_item" the array (and the whole path) must already exist;
  // "set" and "insert_item" may create intermediate containers on the way.
  const parent = navigateToParent(draft, segments, op.op !== 'remove_item');
  if (!parent.ok) {
    return {opIndex, op: op.op, ...parent.error};
  }
  const container = parent.container;

  if (op.op === 'set') {
    if (op.value === undefined) {
      return makeEditError(
        opIndex,
        op,
        childPath,
        'A "set" operation requires a `value`.',
        'value',
        'undefined'
      );
    }
    if (Array.isArray(container)) {
      if (!lastIsIndex) {
        return makeEditError(
          opIndex,
          op,
          childPath,
          'Use a zero-based array index to set an array item.',
          'array index',
          lastSeg
        );
      }
      const idx = Number(lastSeg);
      if (idx > container.length) {
        return makeEditError(
          opIndex,
          op,
          childPath,
          'Array index is out of range; set an existing index or append at the array length.',
          `0..${container.length}`,
          idx
        );
      }
      container[idx] = op.value;
      return null;
    }
    if (container && typeof container === 'object') {
      if (lastIsIndex) {
        return makeEditError(
          opIndex,
          op,
          childPath,
          'Array index used on a non-array field.',
          'object key',
          lastSeg
        );
      }
      container[lastSeg] = op.value;
      return null;
    }
    return makeEditError(
      opIndex,
      op,
      childPath,
      'Cannot set a value here; the parent is not an object or array.',
      'object or array',
      typeName(container)
    );
  }

  // insert_item / remove_item target the ARRAY located at op.path.
  let arr = getChild(container, lastSeg, lastIsIndex);

  if (op.op === 'insert_item') {
    if (op.value === undefined) {
      return makeEditError(
        opIndex,
        op,
        childPath,
        'An "insert_item" operation requires a `value`.',
        'value',
        'undefined'
      );
    }
    if (arr === undefined || arr === null) {
      arr = [];
      const setError = setChild(
        container,
        lastSeg,
        lastIsIndex,
        arr,
        opIndex,
        op
      );
      if (setError) {
        return setError;
      }
    }
    if (!Array.isArray(arr)) {
      return makeEditError(
        opIndex,
        op,
        childPath,
        'The target of an "insert_item" must be an array field.',
        'array',
        typeName(arr)
      );
    }
    const at = op.index === undefined ? arr.length : op.index;
    if (at < 0 || at > arr.length) {
      return makeEditError(
        opIndex,
        op,
        childPath,
        'Insert index is out of range.',
        `0..${arr.length}`,
        at
      );
    }
    arr.splice(at, 0, op.value);
    return null;
  }

  // remove_item
  if (!Array.isArray(arr)) {
    return makeEditError(
      opIndex,
      op,
      childPath,
      'The target of a "remove_item" must be an array field.',
      'array',
      typeName(arr)
    );
  }
  if (op.index === undefined) {
    return makeEditError(
      opIndex,
      op,
      childPath,
      'A "remove_item" operation requires an `index`.',
      'index',
      'undefined'
    );
  }
  if (op.index < 0 || op.index >= arr.length) {
    return makeEditError(
      opIndex,
      op,
      childPath,
      'Remove index is out of range.',
      `0..${Math.max(arr.length - 1, 0)}`,
      op.index
    );
  }
  arr.splice(op.index, 1);
  return null;
}

interface PathFailure {
  path: string;
  message: string;
  expected?: string;
  received?: any;
}

/**
 * Walks `root` through every segment except the last and returns the parent
 * container of the final segment. When `create` is true, missing intermediate
 * object/array containers are created on the way down.
 */
function navigateToParent(
  root: any,
  segments: string[],
  create: boolean
): {ok: true; container: any} | {ok: false; error: PathFailure} {
  let cur = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const segPath = segments.slice(0, i + 1).join('.');
    const isIndex = INDEX_RE.test(seg);
    if (Array.isArray(cur)) {
      if (!isIndex) {
        return pathFail(
          segPath,
          'Expected a zero-based array index after an array field.',
          'array index',
          seg
        );
      }
      const idx = Number(seg);
      if (idx >= cur.length) {
        return pathFail(
          segPath,
          'Array index is out of range for the current draft.',
          `0..${Math.max(cur.length - 1, 0)}`,
          idx
        );
      }
      cur = cur[idx];
      continue;
    }
    if (cur === null || typeof cur !== 'object') {
      return pathFail(
        segPath,
        'Path walks through a value that is not an object or array.',
        'object or array',
        typeName(cur)
      );
    }
    if (isIndex) {
      return pathFail(
        segPath,
        'Array index used on a non-array field.',
        'object key',
        seg
      );
    }
    if (cur[seg] === undefined || cur[seg] === null) {
      if (!create) {
        return pathFail(
          segPath,
          'Path segment does not exist in the current draft.',
          'existing field',
          seg
        );
      }
      cur[seg] = INDEX_RE.test(segments[i + 1]) ? [] : {};
    }
    cur = cur[seg];
  }
  return {ok: true, container: cur};
}

function getChild(container: any, seg: string, isIndex: boolean): any {
  if (Array.isArray(container)) {
    return isIndex ? container[Number(seg)] : undefined;
  }
  if (container && typeof container === 'object') {
    return container[seg];
  }
  return undefined;
}

function setChild(
  container: any,
  seg: string,
  isIndex: boolean,
  value: any,
  opIndex: number,
  op: DocEditOperation
): DocEditError | null {
  if (Array.isArray(container)) {
    if (!isIndex) {
      return makeEditError(
        opIndex,
        op,
        op.path.trim(),
        'Use a zero-based array index for an array field.',
        'array index',
        seg
      );
    }
    container[Number(seg)] = value;
    return null;
  }
  if (container && typeof container === 'object') {
    if (isIndex) {
      return makeEditError(
        opIndex,
        op,
        op.path.trim(),
        'Array index used on a non-array field.',
        'object key',
        seg
      );
    }
    container[seg] = value;
    return null;
  }
  return makeEditError(
    opIndex,
    op,
    op.path.trim(),
    'Cannot write here; the parent is not an object or array.',
    'object or array',
    typeName(container)
  );
}

function pathFail(
  path: string,
  message: string,
  expected: string,
  received: any
): {ok: false; error: PathFailure} {
  return {ok: false, error: {path, message, expected, received}};
}

function makeEditError(
  opIndex: number,
  op: DocEditOperation,
  path: string,
  message: string,
  expected?: string,
  received?: any
): DocEditError {
  return {opIndex, op: op.op, path, message, expected, received};
}

function typeName(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
