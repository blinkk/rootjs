import {DraftDocEventType} from '../../../../hooks/useDraftDoc.js';
import {EventListener} from '../../../../utils/events.js';
import {cloneData} from '../../../../utils/objects.js';
import {getNestedValue} from '../../../../utils/objects.js';

export type Listener = (value: any) => void;

export class InMemoryDraftDocController extends EventListener {
  private data: Record<string, any>;
  private listeners = new Map<string, Set<Listener>>();

  docId = 'custom-block';
  collectionId = 'custom-block';
  slug = 'custom-block';

  constructor(initialValue: Record<string, any>, rootKey = 'block') {
    super();
    this.data = {[rootKey]: cloneData(initialValue)};
  }

  getValue(key: string): any {
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

  getDataSnapshot() {
    return cloneData(this.data);
  }

  getData() {
    return this.getDataSnapshot();
  }

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
