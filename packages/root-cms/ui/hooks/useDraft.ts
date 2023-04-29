import {showNotification} from '@mantine/notifications';
import {
  doc,
  DocumentReference,
  Firestore,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {debounce} from '../utils/debounce.js';
import {EventListener} from '../utils/events.js';
import {getNestedValue, isObject} from '../utils/objects.js';

const SAVE_DELAY_MS = 3 * 1000;

export enum SaveState {
  NO_CHANGES = 'NO_CHANGES',
  UPDATES_PENDING = 'UPDATE_PENDING',
  SAVING = 'SAVING',
  SAVED = 'SAVED',
  ERROR = 'ERROR',
}

export enum EventType {
  /** Changes made to the draft document and are pending a save to the DB. */
  CHANGE = 'CHANGE',
  /** The `SaveState` changed. */
  SAVE_STATE_CHANGE = 'SAVE_STATE_CHANGE',
  /** Data was saved to the DB. */
  FLUSH = 'FLUSH',
}

type Subscribers = Record<string, Set<SubscriberCallback>>;
type SubscriberCallback = (newValue: any) => void;
type UnsubscribeCallback = () => void;

export class DraftController extends EventListener {
  readonly projectId: string;
  readonly collectionId: string;
  readonly slug: string;
  private db: Firestore;
  private docRef: DocumentReference;

  private pendingUpdates = new Map<string, any>();
  private dbUnsubscribe?: () => void;
  private cachedData: any = {};
  private subscribers: Subscribers = {};
  private saveState = SaveState.NO_CHANGES;
  started = false;

  constructor(docId: string) {
    super();
    this.projectId = window.__ROOT_CTX.rootConfig.projectId;
    const [collectionId, slug] = docId.split('/');
    this.collectionId = collectionId;
    this.slug = slug;
    this.db = window.firebase.db;
    this.docRef = doc(
      this.db,
      'Projects',
      this.projectId,
      'Collections',
      collectionId,
      'Drafts',
      slug
    );
  }

  /**
   * Listens for changes on the document.
   */
  async start() {
    if (this.started) {
      return;
    }
    console.log('start()');
    this.started = true;
    this.dbUnsubscribe = onSnapshot(this.docRef, (snapshot) => {
      const data = snapshot.data();
      // Save the user's local changes to the snapshot so that their updates
      // are not overwritten.
      if (this.pendingUpdates.size > 0) {
        applyUpdates(data, Object.fromEntries(this.pendingUpdates));
      }
      this.cachedData = data;
      console.log('onSnapshot()', data, this.pendingUpdates);
      this.notifySubscribers();
    });
  }

  /**
   * Stops listening for changes and saves any pending data to the db.
   */
  stop() {
    if (!this.started) {
      return;
    }
    console.log('stop()');
    if (this.dbUnsubscribe) {
      this.dbUnsubscribe();
    }
    this.flush();
    this.started = false;
  }

  /**
   * Adds a listener for data change events.
   */
  onChange(callback: (data: any) => void) {
    return this.on(EventType.CHANGE, callback);
  }

  /**
   * Adds a listener for save state change events.
   */
  onSaveStateChange(callback: (saveState: SaveState) => void) {
    return this.on(EventType.SAVE_STATE_CHANGE, callback);
  }

  /**
   * Adds a listener for db write events.
   */
  onFlush(callback: () => void) {
    return this.on(EventType.FLUSH, callback);
  }

  /**
   * Subscribes to remote changes for a given key. Returns a callback function
   * that can be used to unsubscribe.
   */
  subscribe(key: string, callback: SubscriberCallback): UnsubscribeCallback {
    console.log('subscribe()', key);
    this.subscribers[key] ??= new Set();
    this.subscribers[key].add(callback);
    callback(getNestedValue(this.cachedData, key));

    const unsubscribe = () => {
      this.subscribers[key].delete(callback);
      if (this.subscribers[key].size === 0) {
        delete this.subscribers[key];
      }
    };
    return unsubscribe;
  }

  /**
   * Notifies subscribers of changes.
   */
  notifySubscribers() {
    console.log('notifySubscribers()');
    const data = this.cachedData;
    this.dispatch(EventType.CHANGE, data);
    notify(this.subscribers, data);
  }

  /**
   * Updates a single key. The key can be a nested key, e.g. "meta.title".
   */
  async updateKey(key: string, newValue: any) {
    this.updateKeys({[key]: newValue});
  }

  /**
   * Updates a group of keys. The keys can be a nested, e.g. "meta.title".
   */
  async updateKeys(updates: Record<string, any>) {
    console.log('updateKeys()', updates);
    for (const key in updates) {
      this.pendingUpdates.set(key, updates[key]);
    }
    applyUpdates(this.cachedData, updates);
    this.dispatch(EventType.CHANGE, this.cachedData);
    this.setSaveState(SaveState.UPDATES_PENDING);
    this.queueChanges();
  }

  /**
   * Removes a key.
   */
  async removeKey(key: string) {
    this.pendingUpdates.set(key, deleteField());
    applyUpdates(this.cachedData, {[key]: undefined});
    this.dispatch(EventType.CHANGE, this.cachedData);
    this.setSaveState(SaveState.UPDATES_PENDING);
    this.queueChanges();
  }

  /**
   * Queues changes using a debounce function. This function can be called any
   * number of times, and the write will go through N seconds after the last
   * update.
   */
  private queueChanges = debounce(() => this.flush(), SAVE_DELAY_MS);

  private setSaveState(newSaveState: SaveState) {
    const oldSaveState = this.saveState;
    // When saving data to the db, if any new pending updates come in, keep the
    // saveState as PENDING.
    if (newSaveState === SaveState.SAVED && oldSaveState !== SaveState.SAVING) {
      return;
    }
    this.saveState = newSaveState;

    // After N seconds, revert from "SAVED" to "NO_CHANGES".
    if (newSaveState === SaveState.SAVED) {
      window.setTimeout(() => {
        if (this.saveState === SaveState.SAVED) {
          this.setSaveState(SaveState.NO_CHANGES);
        }
      }, SAVE_DELAY_MS);
    }

    this.dispatch(EventType.SAVE_STATE_CHANGE, newSaveState);
  }

  /**
   * Immediately write all queued data to the DB.
   */
  async flush() {
    if (this.pendingUpdates.size === 0) {
      return;
    }
    const updates = Object.fromEntries(this.pendingUpdates);
    updates['sys.modifiedAt'] = serverTimestamp();
    updates['sys.modifiedBy'] = window.firebase.user.email;
    console.log('flush()', updates);

    // Immediately clear the pending updates so that there's no race condition
    // with any new updates the user makes while the changes are being saved to
    // the db. If the db save fails for any reason, re-apply the pending updates
    // and re-queue the db save.
    this.pendingUpdates.clear();
    try {
      this.setSaveState(SaveState.SAVING);
      await updateDoc(this.docRef, updates);
      this.setSaveState(SaveState.SAVED);
      this.dispatch(EventType.FLUSH);
    } catch (err) {
      console.error('failed to update doc');
      console.error(err);
      this.setSaveState(SaveState.ERROR);
      showNotification({
        title: 'Failed to save',
        message: `Failed to save changes to ${this.slug}`,
        color: 'red',
        autoClose: false,
      });
      for (const key in updates) {
        // Ignore sys updates.
        if (key.startsWith('sys.')) {
          continue;
        }
        // Ignore keys that have newer values.
        if (this.pendingUpdates.has(key)) {
          continue;
        }
        this.pendingUpdates.set(key, updates[key]);
        this.queueChanges();
        console.log('re-queued updates');
      }
    }
  }

  getLocales(): string[] {
    if (this.cachedData && this.cachedData.sys?.locales) {
      return this.cachedData.sys.locales;
    }
    return ['en'];
  }

  setLocales(locales: string[]) {
    this.updateKey('sys.locales', locales);
  }

  /**
   * Stops all listeners and disposes the controller.
   */
  async dispose() {
    super.dispose();
    this.stop();
  }
}

function applyUpdates(data: any, updates: any) {
  for (const key in updates) {
    const val = updates[key];
    if (key.includes('.')) {
      const [head, tail] = splitKey(key);
      data[head] ??= {};
      applyUpdates(data[head], {[tail]: val});
    } else {
      if (typeof val === 'undefined') {
        delete data[key];
      } else {
        data[key] = val;
      }
    }
  }
}

/**
 * Recursively walks the data tree and notifies subscribers of the new value.
 */
function notify(subscribers: Subscribers, data: any, parentKeys?: string[]) {
  if (!parentKeys) {
    parentKeys = [];
  }

  for (const key in data) {
    const keys = [...parentKeys, key];
    const deepKey = keys.join('.');
    const callbacks = subscribers[deepKey];
    const newValue = data[key];
    if (callbacks) {
      // console.log('notifying', deepKey, newValue, callbacks);
      Array.from(callbacks).forEach((cb) => {
        cb(newValue);
      });
    }
    if (isObject(newValue)) {
      notify(subscribers, newValue, keys);
    }
  }
}

function splitKey(key: string) {
  const index = key.indexOf('.');
  const head = key.substring(0, index);
  const tail = key.substring(index + 1);
  return [head, tail] as const;
}

export interface UseDraftHook {
  loading: boolean;
  saveState: SaveState;
  controller: DraftController;
  data: any;
}

export function useDraft(docId: string): UseDraftHook {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({});
  const controller = useMemo(() => new DraftController(docId), []);
  const [saveState, setSaveState] = useState(SaveState.NO_CHANGES);

  useEffect(() => {
    controller.onChange((data: any) => {
      setData(data);
      setLoading(false);
    });
    controller.onSaveStateChange((newSaveState) => setSaveState(newSaveState));
    controller.start();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || document.visibilityState !== 'visible') {
        controller.stop();
      } else {
        if (!controller.started) {
          setLoading(true);
          controller.start();
        }
      }
    });
    return () => controller.dispose();
  }, []);

  return {loading, saveState, controller, data};
}
