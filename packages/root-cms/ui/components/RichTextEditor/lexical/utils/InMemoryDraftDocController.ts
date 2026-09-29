import {DraftDocEventType} from '../../../../hooks/useDraftDoc.js';
import {EventListener} from '../../../../utils/events.js';
import {cloneData} from '../../../../utils/objects.js';
import {getNestedValue} from '../../../../utils/objects.js';

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
  }

  getValue(key: string): any {
    // The doc's `sys` data (e.g. `sys.l10nSheet`) is read from the parent doc.
    if (this.parent && (key === 'sys' || key.startsWith('sys.'))) {
      return this.parent.getValue(key);
    }
    return getNestedValue(this.data, key);
  }

  async updateKey(key: string, value: any) {
    setNestedValue(this.data, key, value);
    this.notify(key);
  }

  async updateKeys(updates: Record<string, any>) {
    for (const [key, value] of Object.entries(updates)) {
      setNestedValue(this.data, key, value);
      this.notify(key);
    }
  }

  async removeKey(key: string) {
    deleteNestedValue(this.data, key);
    this.notify(key);
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
   * Since `notify()` already walks the key hierarchy and fires every ancestor
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

  private notify(key: string) {
    this.dispatch(DraftDocEventType.VALUE_CHANGE, key, this.getValue(key));
    for (const target of getKeyHierarchy(key)) {
      const listeners = this.listeners.get(target);
      if (!listeners) {
        continue;
      }
      const value = this.getValue(target);
      listeners.forEach((cb) => cb(value));
    }
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
