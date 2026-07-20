import {isRichTextData} from '../../shared/marshal.js';
import {EventListener} from './events.js';
import {deepEqual} from './objects.js';
import {autokey} from './rand.js';

/**
 * In-session undo/redo history for the doc editor.
 *
 * The history stores value transitions per deepkey and applies them with
 * compare-and-swap semantics: an entry is only applied when the current value
 * still matches what the entry expects, so undo/redo can never clobber a
 * newer edit (e.g. from another user via the realtime snapshot listener).
 */

const MAX_ENTRIES = 100;

/**
 * Rapid successive single-key captures (e.g. typing) within this window are
 * merged into one history entry.
 */
const COALESCE_WINDOW_MS = 1000;

export enum EditHistoryEventType {
  /** The undo/redo stacks changed (entries pushed, popped, or dropped). */
  CHANGE = 'CHANGE',
}

/** One key's captured transition. `undefined` means the key does not exist. */
export interface EditHistoryChange {
  before: any;
  after: any;
}

export interface EditHistoryEntry {
  id: string;
  /** Map of deepkey -> transition. Multi-key entries undo as one step. */
  changes: Record<string, EditHistoryChange>;
  createdAt: number;
  updatedAt: number;
  /** Optional human label, e.g. "Removed item" (shown in tooltips/toasts). */
  label?: string;
  /** Entries created via `group()` never coalesce with later captures. */
  sealed?: boolean;
}

export type EditHistoryApplyResult =
  | {status: 'applied'; updates: Record<string, any>; entry: EditHistoryEntry}
  | {status: 'conflict'; entry: EditHistoryEntry}
  | {status: 'empty'};

export interface EditHistoryOptions {
  maxEntries?: number;
  coalesceWindowMs?: number;
  /** Clock function, injectable for tests. */
  now?: () => number;
}

export class EditHistory extends EventListener {
  private undoStack: EditHistoryEntry[] = [];
  private redoStack: EditHistoryEntry[] = [];
  /** Non-null while inside a `group()` callback. */
  private groupEntry: EditHistoryEntry | null = null;
  private maxEntries: number;
  private coalesceWindowMs: number;
  private now: () => number;

  constructor(options?: EditHistoryOptions) {
    super();
    this.maxEntries = options?.maxEntries ?? MAX_ENTRIES;
    this.coalesceWindowMs = options?.coalesceWindowMs ?? COALESCE_WINDOW_MS;
    this.now = options?.now ?? Date.now;
  }

  /**
   * Records a set of value transitions as a single history entry. Values are
   * cloned at capture time: the store mutates its objects in place and shares
   * references with pending Firestore updates, so an uncloned `after` would
   * silently absorb later child edits and break the compare-and-swap
   * validation in `undo()`/`redo()`.
   */
  capture(
    changes: Record<string, EditHistoryChange>,
    options?: {label?: string}
  ) {
    const cloned: Record<string, EditHistoryChange> = {};
    for (const key of Object.keys(changes)) {
      const change = changes[key];
      if (deepEqual(change.before, change.after)) {
        continue;
      }
      cloned[key] = {
        before: clonePreservingNonPlain(change.before),
        after: clonePreservingNonPlain(change.after),
      };
    }
    const keys = Object.keys(cloned);
    if (keys.length === 0) {
      return;
    }

    if (this.groupEntry) {
      // Merge into the open group, preserving the first-seen `before` so the
      // whole group undoes to the pre-group state in one step.
      for (const key of keys) {
        const existing = this.groupEntry.changes[key];
        if (existing) {
          existing.after = cloned[key].after;
        } else {
          this.groupEntry.changes[key] = cloned[key];
        }
      }
      this.groupEntry.updatedAt = this.now();
      return;
    }

    const timestamp = this.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (
      top &&
      !top.sealed &&
      keys.length === 1 &&
      hasSingleKey(top.changes, keys[0]) &&
      timestamp - top.updatedAt < this.coalesceWindowMs
    ) {
      const key = keys[0];
      top.changes[key].after = cloned[key].after;
      top.updatedAt = timestamp;
      // Typing forward and back within the window can leave the coalesced
      // entry a no-op; drop it rather than surfacing an undo that does
      // nothing.
      if (deepEqual(top.changes[key].before, top.changes[key].after)) {
        this.undoStack.pop();
      }
      this.clearRedo();
      this.dispatchChange();
      return;
    }

    this.pushEntry({
      id: autokey(),
      changes: cloned,
      createdAt: timestamp,
      updatedAt: timestamp,
      label: options?.label,
    });
  }

  /**
   * Runs `fn`, merging every capture that happens during it into a single
   * history entry (e.g. cut+paste of an array item). Nested groups join the
   * outermost group.
   */
  group<T>(label: string, fn: () => T): T {
    if (this.groupEntry) {
      return fn();
    }
    const timestamp = this.now();
    const entry: EditHistoryEntry = {
      id: autokey(),
      changes: {},
      createdAt: timestamp,
      updatedAt: timestamp,
      label: label,
      sealed: true,
    };
    this.groupEntry = entry;
    try {
      return fn();
    } finally {
      this.groupEntry = null;
      // Prune keys whose transitions cancelled out within the group.
      for (const key of Object.keys(entry.changes)) {
        const change = entry.changes[key];
        if (deepEqual(change.before, change.after)) {
          delete entry.changes[key];
        }
      }
      if (Object.keys(entry.changes).length > 0) {
        this.pushEntry(entry);
      }
    }
  }

  /**
   * Pops the top undo entry and returns the updates map that restores its
   * `before` values. The entry is only applied when every key's current value
   * (via `getValue`) still deep-equals the entry's `after` value; otherwise
   * the entry is stale (e.g. a remote edit landed) and is dropped.
   */
  undo(getValue: (key: string) => any): EditHistoryApplyResult {
    return this.apply(this.undoStack, this.redoStack, 'before', getValue);
  }

  /** Reverse of `undo()`: re-applies the top redo entry's `after` values. */
  redo(getValue: (key: string) => any): EditHistoryApplyResult {
    return this.apply(this.redoStack, this.undoStack, 'after', getValue);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  peekUndo(): EditHistoryEntry | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }

  peekRedo(): EditHistoryEntry | undefined {
    return this.redoStack[this.redoStack.length - 1];
  }

  /**
   * Drops entries invalidated by a remote data replacement (another editor's
   * write, version restore, revert draft, AI edits). Only the top of each
   * stack is checked, draining while stale: deeper entries cannot be
   * validated eagerly since their expected values legitimately differ
   * whenever a later entry touched the same key; those are validated lazily
   * at apply time instead.
   */
  handleRemoteData(getValue: (key: string) => any) {
    let changed = false;
    while (this.undoStack.length > 0) {
      const top = this.undoStack[this.undoStack.length - 1];
      if (entryMatchesCurrent(top, 'after', getValue)) {
        break;
      }
      this.undoStack.pop();
      changed = true;
    }
    while (this.redoStack.length > 0) {
      const top = this.redoStack[this.redoStack.length - 1];
      if (entryMatchesCurrent(top, 'before', getValue)) {
        break;
      }
      this.redoStack.pop();
      changed = true;
    }
    if (changed) {
      this.dispatchChange();
    }
  }

  clear() {
    if (this.undoStack.length === 0 && this.redoStack.length === 0) {
      return;
    }
    this.undoStack = [];
    this.redoStack = [];
    this.dispatchChange();
  }

  onChange(callback: () => void): () => void {
    return this.on(EditHistoryEventType.CHANGE, callback);
  }

  private apply(
    fromStack: EditHistoryEntry[],
    toStack: EditHistoryEntry[],
    restoreSide: 'before' | 'after',
    getValue: (key: string) => any
  ): EditHistoryApplyResult {
    const entry = fromStack[fromStack.length - 1];
    if (!entry) {
      return {status: 'empty'};
    }
    const expectSide = restoreSide === 'before' ? 'after' : 'before';
    if (!entryMatchesCurrent(entry, expectSide, getValue)) {
      fromStack.pop();
      this.dispatchChange();
      return {status: 'conflict', entry};
    }
    fromStack.pop();
    const updates: Record<string, any> = {};
    for (const key of Object.keys(entry.changes)) {
      const change = entry.changes[key];
      // Lexical's OnChangePlugin only accepts an external value whose `time`
      // is newer than its last serialization, so restored rich text blobs get
      // a fresh stamp. The bump is written into the stored change (not just
      // the outgoing clone) to keep the entry's values exactly in sync with
      // the store for future compare-and-swap validation.
      bumpRichTextTimes(change[restoreSide], this.now);
      // Clone on the way out: the store absorbs applied values by reference
      // and mutates them in place, which would otherwise alias the entry's
      // stored values and corrupt validation.
      updates[key] = clonePreservingNonPlain(change[restoreSide]);
    }
    toStack.push(entry);
    this.dispatchChange();
    return {status: 'applied', updates, entry};
  }

  private pushEntry(entry: EditHistoryEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift();
    }
    this.clearRedo();
    this.dispatchChange();
  }

  private clearRedo() {
    if (this.redoStack.length > 0) {
      this.redoStack = [];
    }
  }

  private dispatchChange() {
    this.dispatch(EditHistoryEventType.CHANGE);
  }
}

/** Returns true when `changes` has exactly one key equal to `key`. */
function hasSingleKey(changes: Record<string, EditHistoryChange>, key: string) {
  const keys = Object.keys(changes);
  return keys.length === 1 && keys[0] === key;
}

/**
 * Returns true when every key in the entry currently holds the value the
 * entry expects on the given side.
 */
function entryMatchesCurrent(
  entry: EditHistoryEntry,
  side: 'before' | 'after',
  getValue: (key: string) => any
): boolean {
  for (const key of Object.keys(entry.changes)) {
    if (!valuesEqual(getValue(key), entry.changes[key][side])) {
      return false;
    }
  }
  return true;
}

/** deepEqual() with support for scalar `undefined`/primitive comparisons. */
function valuesEqual(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }
  return deepEqual(a, b);
}

/**
 * Deep-clones arrays and plain objects while passing non-plain objects (e.g.
 * Firestore Timestamp) through by reference. `structuredClone()` is not used
 * because it strips class prototypes, which would break `Timestamp` values.
 */
export function clonePreservingNonPlain(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => clonePreservingNonPlain(item));
  }
  if (isPlainObject(value)) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      result[key] = clonePreservingNonPlain(value[key]);
    }
    return result;
  }
  return value;
}

/**
 * Recursively refreshes the `time` stamp on any rich text data within a
 * value (mutating in place). Returns the value for convenience.
 */
export function bumpRichTextTimes(value: any, now: () => number): any {
  if (Array.isArray(value)) {
    for (const item of value) {
      bumpRichTextTimes(item, now);
    }
    return value;
  }
  if (isPlainObject(value)) {
    if (isRichTextData(value)) {
      value.time = now();
      return value;
    }
    for (const key of Object.keys(value)) {
      bumpRichTextTimes(value[key], now);
    }
  }
  return value;
}

/** Returns true for plain objects (object literals, JSON-parsed objects). */
function isPlainObject(value: any): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
