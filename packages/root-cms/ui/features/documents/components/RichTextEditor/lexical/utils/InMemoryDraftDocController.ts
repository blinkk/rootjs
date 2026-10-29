import {EventListener} from '../../../../../../utils/events.js';
import {cloneData, deepEqual} from '../../../../../../utils/objects.js';
import {getNestedValue} from '../../../../../../utils/objects.js';
import {
  EditHistory,
  EditHistoryApplyResult,
  EditHistoryChange,
} from '../../../../edit-history.js';
import {DraftDocEventType} from '../../../../useDraftDoc.js';

export type Listener = (value: any) => void;

/**
 * The parent doc's draft controller, i.e. the doc that contains the rich text
 * field being edited.
 */
export interface ParentDraftDocController {
  docId: string;
  collectionId: string;
  slug: string;
  getValue(key: string): any;
}

export interface InMemoryDraftDocControllerOptions {
  /**
   * The parent doc's controller. When set, the parent's doc id and `sys` data
   * are exposed so that features that operate on the doc as a whole (e.g. the
   * "Show translations" modal) reference the actual doc instead of the block.
   */
  parent?: ParentDraftDocController | null;
}

export class InMemoryDraftDocController extends EventListener {
  private data: Record<string, any>;
  private listeners = new Map<string, Set<Listener>>();
  private parent: ParentDraftDocController | null;
  /** Set while an undo/redo is being applied, to suppress history capture. */
  private isApplyingHistory = false;

  /**
   * In-memory undo/redo history. Mirrors `DraftDocController.history`, which
   * `DocEditor` uses for destructive actions (e.g. removing an array item).
   */
  readonly history = new EditHistory();

  docId: string;
  collectionId: string;
  slug: string;

  constructor(
    initialValue: Record<string, any>,
    rootKey = 'block',
    options?: InMemoryDraftDocControllerOptions
  ) {
    super();
    this.data = {[rootKey]: cloneData(initialValue)};
    this.parent = options?.parent || null;
    this.docId = this.parent?.docId || 'custom-block';
    this.collectionId = this.parent?.collectionId || 'custom-block';
    this.slug = this.parent?.slug || 'custom-block';
    this.history.onChange(() => {
      this.dispatch(DraftDocEventType.HISTORY_CHANGE);
    });
  }

  getValue(key: string): any {
    // The doc's `sys` data (e.g. `sys.l10nSheet`) is read from the parent doc.
    if (this.parent && (key === 'sys' || key.startsWith('sys.'))) {
      return this.parent.getValue(key);
    }
    return getNestedValue(this.data, key);
  }

  async updateKey(key: string, value: any) {
    this.applyUpdates({[key]: value});
  }

  async updateKeys(updates: Record<string, any>) {
    this.applyUpdates(updates);
  }

  async removeKey(key: string) {
    this.applyUpdates({[key]: undefined});
  }

  /**
   * Reverts the most recent edit. Mirrors `DraftDocController.undo()`.
   */
  undo(options?: {onlyEntryId?: string}): EditHistoryApplyResult {
    return this.applyHistory('undo', options);
  }

  /** Re-applies the most recently undone edit. */
  redo(): EditHistoryApplyResult {
    return this.applyHistory('redo');
  }

  subscribe(key: string, cb: Listener) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(cb);
    cb(this.getValue(key));
    return () => {
      this.listeners.get(key)?.delete(cb);
    };
  }

  /**
   * Subscribes to changes anywhere within a given key's subtree. Mirrors the
   * `DraftDocController.subscribeSubtree` API so that components like
   * `DocEditor.ArrayFieldPreview` (which expect this method) work when
   * rendered inside a `DocEditor` driven by this in-memory controller.
   *
   * Since `applyUpdates()` already walks the key hierarchy and fires every ancestor
   * listener whenever any descendant changes, plain `subscribe` provides the
   * same subtree-change semantics here.
   */
  subscribeSubtree(key: string, cb: Listener) {
    return this.subscribe(key, cb);
  }

  getDataSnapshot() {
    const data = cloneData(this.data);
    const sys = this.getValue('sys');
    if (sys) {
      data.sys = cloneData(sys);
    }
    return data;
  }

  getData() {
    return this.getDataSnapshot();
  }

  /**
   * No-op. Changes are held in memory and committed to the parent doc when the
   * block or inline component modal is submitted. Mirrors the
   * `DraftDocController.flush` API for callers like `EditTranslationsModal`.
   */
  async flush() {}

  /**
   * Writes all updates before notifying listeners, so that listeners never
   * observe a partially-applied batch (e.g. an array's `_array` order that
   * references an item key that hasn't been written yet). An `undefined` value
   * deletes the key, matching `DraftDocController`.
   */
  private applyUpdates(updates: Record<string, any>) {
    this.captureHistory(updates);
    const keys = Object.keys(updates);
    // Snapshot descendant listeners' values before mutating, so that only the
    // ones whose values actually change are notified.
    const descendantValues = new Map<string, any>();
    for (const listenerKey of this.listeners.keys()) {
      if (keys.some((key) => listenerKey.startsWith(`${key}.`))) {
        descendantValues.set(listenerKey, this.getValue(listenerKey));
      }
    }
    for (const key of keys) {
      const value = updates[key];
      if (value === undefined) {
        deleteNestedValue(this.data, key);
      } else {
        setNestedValue(this.data, key, value);
      }
    }
    for (const key of keys) {
      this.dispatch(DraftDocEventType.VALUE_CHANGE, key, this.getValue(key));
    }

    const targets = new Set<string>();
    for (const key of keys) {
      getKeyHierarchy(key).forEach((target) => targets.add(target));
    }
    // A parent object being replaced or cleared changes its descendants too.
    for (const [listenerKey, oldValue] of descendantValues) {
      if (!deepEqual(oldValue, this.getValue(listenerKey))) {
        targets.add(listenerKey);
      }
    }
    for (const target of targets) {
      const listeners = this.listeners.get(target);
      if (!listeners) {
        continue;
      }
      const value = this.getValue(target);
      listeners.forEach((cb) => cb(value));
    }
  }

  /**
   * Records the before/after transition of a write in the undo history.
   * Unlike `DraftDocController`, content lives under the root key (e.g.
   * `block` or `component`) rather than `fields`, so every non-`sys` key is
   * captured.
   */
  private captureHistory(updates: Record<string, any>) {
    if (this.isApplyingHistory) {
      return;
    }
    const changes: Record<string, EditHistoryChange> = {};
    for (const key in updates) {
      if (key !== 'sys' && !key.startsWith('sys.')) {
        changes[key] = {before: this.getValue(key), after: updates[key]};
      }
    }
    if (Object.keys(changes).length > 0) {
      this.history.capture(changes);
    }
  }

  private applyHistory(
    direction: 'undo' | 'redo',
    options?: {onlyEntryId?: string}
  ): EditHistoryApplyResult {
    if (options?.onlyEntryId) {
      const top =
        direction === 'undo'
          ? this.history.peekUndo()
          : this.history.peekRedo();
      if (!top || top.id !== options.onlyEntryId) {
        return {status: 'empty'};
      }
    }
    const getValue = (key: string) => this.getValue(key);
    const result =
      direction === 'undo'
        ? this.history.undo(getValue)
        : this.history.redo(getValue);
    if (result.status === 'applied') {
      this.isApplyingHistory = true;
      try {
        this.applyUpdates(result.updates);
      } finally {
        this.isApplyingHistory = false;
      }
      this.dispatch(
        DraftDocEventType.HISTORY_APPLIED,
        Object.keys(result.updates)
      );
    }
    return result;
  }
}

export function setNestedValue(
  target: Record<string, any>,
  key: string,
  value: any
) {
  const parts = key.split('.');
  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      typeof current[part] !== 'object' ||
      current[part] === null ||
      Array.isArray(current[part])
    ) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts.at(-1)!] = value;
}

export function deleteNestedValue(target: Record<string, any>, key: string) {
  const parts = key.split('.');
  let current: Record<string, any> | undefined = target;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current?.[parts[i]];
    if (typeof current !== 'object' || current === null) {
      return;
    }
  }
  if (!current) {
    return;
  }
  delete current[parts.at(-1)!];
}

export function getKeyHierarchy(key: string) {
  const parts = key.split('.');
  const keys: string[] = [];
  for (let i = parts.length; i > 0; i--) {
    keys.push(parts.slice(0, i).join('.'));
  }
  return keys;
}
