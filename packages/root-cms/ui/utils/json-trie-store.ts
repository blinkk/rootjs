import {deepEqual, isObject} from './objects.js';

export type SubscribeCallback = (newValue: any) => void;

export type UnsubscribeCallback = () => void;

/**
 * Represents a node in the subscriber trie. Each node holds subscribers
 * for its path and children nodes for the next key segments.
 */
class TrieNode {
  public subscribers: Set<SubscribeCallback> = new Set();
  public children: Map<string, TrieNode> = new Map();
}

/**
 * A data structure for storing JSON data that allows setting/getting deeply
 * nested values using dot notation and subscribing to changes.
 */
export class JsonTrieStore {
  private data: Record<string, any>;
  private readonly root: TrieNode = new TrieNode();

  constructor(initialData?: Record<string, any>) {
    this.data = initialData || {};
  }

  /**
   * Retrieves a value from the data store using dot notation.
   * @param path The dot-notation path (e.g., 'user.address.city').
   * @returns The value at the specified path or undefined if not found.
   */
  public get(path: string): any {
    return this.getValueFromPath(path, this.data);
  }

  /**
   * Sets a single value at a deeply nested path by calling the update method.
   * @param path The dot-notation path (e.g., 'user.address.city').
   * @param value The value to set at the specified path.
   */
  public set(path: string, value: any) {
    if (path === '') {
      if (isObject(value)) {
        this.setData(value);
      }
      return;
    }
    this.update({[path]: value});
  }

  /**
   * Applies partial updates for one or more deeply nested keys. Mutations
   * are batched, and subscribers are notified efficiently after all changes
   * have been applied.
   * @param updates An object where keys are dot-notation paths and values are
   * the new data for those paths.
   */
  public update(updates: Record<string, any>) {
    const pathsToNotify = new Set<{path: string; value: any}>();

    const addPathToNotify = (path: string, oldValue: any, newValue: any) => {
      pathsToNotify.add({path, value: newValue});
      // Add child paths.
      if (isObject(oldValue) && isObject(newValue)) {
        Object.entries(newValue).forEach(([key, childValue]) => {
          const childOldValue = oldValue[key];
          if (!deepEqual(childOldValue, childValue)) {
            addPathToNotify(`${path}.${key}`, childOldValue, childValue);
          }
        });
        // Notify any deleted keys.
        Object.keys(oldValue).forEach((key) => {
          if (!(key in newValue)) {
            addPathToNotify(`${path}.${key}`, oldValue[key], undefined);
          }
        });
      }
    };

    // Apply all mutations to the data object in-place.
    Object.entries(updates).forEach(([path, newValue]) => {
      let current: any = this.data;
      const keys = path.split('.');
      const lastKey = keys.pop()!;

      for (const key of keys) {
        if (!current[key]) {
          current[key] = {};
        }
        current = current[key];
      }
      const oldValue = current[lastKey];
      current[lastKey] = newValue;

      // Collect notify subscribers on the current path and child paths.
      addPathToNotify(path, oldValue, newValue);
    });

    // Trigger notifications for all affected paths.
    pathsToNotify.forEach((item) => {
      const node = this.getTrieNode(item.path);
      if (node && node.subscribers.size > 0) {
        node.subscribers.forEach((cb) => cb(item.value));
      }
    });

    // Notify subscribers on the root that data has changed.
    this.root.subscribers.forEach((cb) => cb(this.data));
  }

  /**
   * Replaces the entire data object and notifies all subscribers whose
   * watched values have changed.
   * @param newData The new data object.
   */
  public setData(newData: Record<string, any>) {
    const oldData = this.data;
    // Use the deep comparison notifier for total data replacement.
    this.notifyOnUpdate(this.root, '', oldData, newData);
    this.data = newData;
  }

  /**
   * Subscribes a callback function to changes at a specific path.
   * @param path The dot-notation path to watch for changes.
   * @param callback The function to execute when the value at the path changes.
   * @returns A function to unsubscribe the callback.
   */
  public subscribe(
    path: string,
    callback: SubscribeCallback
  ): UnsubscribeCallback {
    const node = this.getTrieNode(path, true)!;
    node.subscribers.add(callback);
    window.setTimeout(() => {
      const value = this.get(path);
      if (value !== undefined) {
        callback(value);
      }
    });
    return () => {
      node.subscribers.delete(callback);
    };
  }

  /**
   * Returns the current stored data.
   */
  public getDataSnapshot(): Record<string, any> {
    return this.data;
  }

  /**
   * Clears all data and subscribers, effectively resetting the store and
   * preventing memory leaks.
   */
  public dispose() {
    this.data = {};
    // By clearing the root's children and subscribers, we allow the garbage
    // collector to reclaim the memory used by the entire trie.
    this.root.subscribers.clear();
    this.root.children.clear();
  }

  /**
   * Recursively traverses trie, compares old/new data, and fires callbacks.
   * Used only by setData for total state replacement.
   */
  private notifyOnUpdate(
    node: TrieNode,
    path: string,
    oldData: Record<string, any>,
    newData: Record<string, any>
  ) {
    const oldValue = this.getValueFromPath(path, oldData);
    const newValue = this.getValueFromPath(path, newData);
    if (!deepEqual(oldValue, newValue)) {
      node.subscribers.forEach((callback) => callback(newValue));
    }
    node.children.forEach((childNode, key) => {
      const newPath = path ? `${path}.${key}` : key;
      this.notifyOnUpdate(childNode, newPath, oldData, newData);
    });
  }

  private getValueFromPath(path: string, source: Record<string, any>): any {
    if (!path) {
      return source;
    }
    const keys = path.split('.');
    let current: any = source;
    for (const key of keys) {
      if (
        current === null ||
        typeof current !== 'object' ||
        !(key in current)
      ) {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }

  private getTrieNode(
    path: string,
    createIfMissing: boolean = false
  ): TrieNode | undefined {
    if (!path) {
      return this.root;
    }
    const keys = path.split('.');
    let currentNode = this.root;
    for (const key of keys) {
      if (!currentNode.children.has(key)) {
        if (createIfMissing) {
          currentNode.children.set(key, new TrieNode());
        } else {
          return undefined;
        }
      }
      currentNode = currentNode.children.get(key)!;
    }
    return currentNode;
  }
}
