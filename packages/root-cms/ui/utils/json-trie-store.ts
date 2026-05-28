import {EventListener} from './events.js';
import {deepEqual, isObject} from './objects.js';

export type SubscribeCallback = (newValue: any) => void;

export type UnsubscribeCallback = () => void;

export enum JsonTrieStoreEventType {
  /** Data change to the json store. */
  CHANGE = 'CHANGE',
  /** Change to a key within the json store. */
  VALUE_CHANGE = 'VALUE_CHANGE',
}

/**
 * Represents a node in the subscriber trie. Each node holds subscribers
 * for its path and children nodes for the next key segments.
 */
class TrieNode {
  public subscribers: Set<SubscribeCallback> = new Set();
  public subtreeSubscribers: Set<SubscribeCallback> = new Set();
  public children: Map<string, TrieNode> = new Map();
}

/**
 * A data structure for storing JSON data that allows setting/getting deeply
 * nested values using dot notation and subscribing to changes.
 */
export class JsonTrieStore extends EventListener {
  private data: Record<string, any>;
  private readonly root: TrieNode = new TrieNode();

  constructor(initialData?: Record<string, any>) {
    super();
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
    const pathsToNotify = new Map<string, any>();

    const addPathToNotify = (path: string, oldValue: any, newValue: any) => {
      pathsToNotify.set(path, newValue);
      if (!isObject(oldValue) && !isObject(newValue)) {
        return;
      }

      // Parent object replacement/deletion must wake descendant subscribers.
      const oldKeys = isObject(oldValue) ? Object.keys(oldValue) : [];
      const newKeys = isObject(newValue) ? Object.keys(newValue) : [];
      const childKeys = new Set([...oldKeys, ...newKeys]);
      childKeys.forEach((key) => {
        const childOldValue = isObject(oldValue) ? oldValue[key] : undefined;
        const childNewValue = isObject(newValue) ? newValue[key] : undefined;
        if (!deepEqual(childOldValue, childNewValue)) {
          addPathToNotify(`${path}.${key}`, childOldValue, childNewValue);
        }
      });
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
      this.dispatch(JsonTrieStoreEventType.VALUE_CHANGE, path, newValue);

      // Collect notify subscribers on the current path and child paths.
      addPathToNotify(path, oldValue, newValue);
    });

    const subtreeNodesToNotify = new Map<string, TrieNode>();
    pathsToNotify.forEach((_value, path) => {
      this.collectSubtreeNotifications(path, subtreeNodesToNotify);
    });

    // Trigger notifications for all affected paths.
    pathsToNotify.forEach((value, path) => {
      const node = this.getTrieNode(path);
      if (node && node.subscribers.size > 0) {
        node.subscribers.forEach((cb) => cb(value));
      }
    });

    subtreeNodesToNotify.forEach((node, path) => {
      const value = this.get(path);
      node.subtreeSubscribers.forEach((cb) => cb(value));
    });

    // Notify subscribers on the root that data has changed.
    this.dispatch(JsonTrieStoreEventType.CHANGE, this.data);
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
    // Notify subscribers on the root that data has changed.
    this.dispatch(JsonTrieStoreEventType.CHANGE, this.data);
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
   * Subscribes a callback to changes anywhere within a path's subtree.
   * @param path The dot-notation path to watch for descendant changes.
   * @param callback The function to execute with the full value at the path.
   * @returns A function to unsubscribe the callback.
   */
  public subscribeSubtree(
    path: string,
    callback: SubscribeCallback
  ): UnsubscribeCallback {
    const node = this.getTrieNode(path, true)!;
    node.subtreeSubscribers.add(callback);
    window.setTimeout(() => {
      const value = this.get(path);
      if (value !== undefined) {
        callback(value);
      }
    });
    return () => {
      node.subtreeSubscribers.delete(callback);
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
    super.dispose();
    this.data = {};
    // By clearing the root's children and subscribers, we allow the garbage
    // collector to reclaim the memory used by the entire trie.
    this.root.subscribers.clear();
    this.root.subtreeSubscribers.clear();
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
      node.subtreeSubscribers.forEach((callback) => callback(newValue));
    }
    node.children.forEach((childNode, key) => {
      const newPath = path ? `${path}.${key}` : key;
      this.notifyOnUpdate(childNode, newPath, oldData, newData);
    });
  }

  private collectSubtreeNotifications(
    path: string,
    nodesToNotify: Map<string, TrieNode>
  ) {
    let currentNode: TrieNode | undefined = this.root;
    if (currentNode.subtreeSubscribers.size > 0) {
      nodesToNotify.set('', currentNode);
    }
    if (!path) {
      return;
    }
    let currentPath = '';
    for (const key of path.split('.')) {
      currentNode = currentNode.children.get(key);
      if (!currentNode) {
        return;
      }
      currentPath = currentPath ? `${currentPath}.${key}` : key;
      if (currentNode.subtreeSubscribers.size > 0) {
        nodesToNotify.set(currentPath, currentNode);
      }
    }
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
