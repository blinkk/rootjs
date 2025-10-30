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
import {ComponentChildren, createContext} from 'preact';
import {useContext, useEffect, useMemo, useState} from 'preact/hooks';
import {logAction} from '../utils/actions.js';
import {debounce} from '../utils/debounce.js';
import {setDocToCache} from '../utils/doc-cache.js';
import {CMSDoc} from '../utils/doc.js';
import {EventListener} from '../utils/events.js';
import {
  JsonTrieStore,
  JsonTrieStoreEventType,
  SubscribeCallback,
  UnsubscribeCallback,
} from '../utils/json-trie-store.js';
import {TIME_UNITS} from '../utils/time.js';

const SAVE_DELAY = 3 * TIME_UNITS.second;
const SAVE_ACTION_LOG_THROTTLE = 5 * TIME_UNITS.minute;

export enum SaveState {
  NO_CHANGES = 'NO_CHANGES',
  UPDATES_PENDING = 'UPDATE_PENDING',
  SAVING = 'SAVING',
  SAVED = 'SAVED',
  ERROR = 'ERROR',
}

export enum DraftDocEventType {
  /** Changes made to the draft doc and are pending a save to the DB. */
  CHANGE = 'CHANGE',
  /** Change to a key within the draft doc. */
  VALUE_CHANGE = 'VALUE_CHANGE',
  /** The `SaveState` changed. */
  SAVE_STATE_CHANGE = 'SAVE_STATE_CHANGE',
  /** Data was saved to the DB. */
  FLUSH = 'FLUSH',
}

/**
 * Number of seconds to wait before disabling db watchers once the browser tab
 * loses visibility.
 */
const VISIBILITY_TIMEOUT = 30 * TIME_UNITS.second;

export class DraftDocController extends EventListener {
  readonly projectId: string;
  readonly docId: string;
  readonly collectionId: string;
  readonly slug: string;
  private db: Firestore;
  private docRef: DocumentReference;
  private store: JsonTrieStore;

  private pendingUpdates = new Map<string, any>();
  private dbUnsubscribe?: () => void;
  private saveState = SaveState.NO_CHANGES;
  private autolock = false;
  private autolockReason = 'autolock';
  private autolockApplied = false;
  started = false;

  constructor(docId: string) {
    super();
    this.projectId = window.__ROOT_CTX.rootConfig.projectId;
    const [collectionId, slug] = docId.split('/');
    this.docId = docId;
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
    this.store = new JsonTrieStore({
      id: this.docId,
      collection: this.collectionId,
      slug: this.slug,
      sys: {},
    });
    this.store.on(JsonTrieStoreEventType.CHANGE, (data: CMSDoc) => {
      this.dispatch(DraftDocEventType.CHANGE, data);
    });
    this.store.on(
      JsonTrieStoreEventType.VALUE_CHANGE,
      (key: string, value: any) => {
        this.dispatch(DraftDocEventType.VALUE_CHANGE, key, value);
      }
    );
    const collection = window.__ROOT_CTX.collections[collectionId];
    if (collection) {
      this.autolock = !!collection.autolock;
      if (collection.autolockReason) {
        this.autolockReason = collection.autolockReason;
      }
    }
  }

  /**
   * Listens for changes on the document.
   */
  async start() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.dbUnsubscribe = onSnapshot(this.docRef, (snapshot) => {
      // Ignore local db write callbacks.
      if (snapshot.metadata.hasPendingWrites) {
        return;
      }
      const data = snapshot.data() || {};
      // Save the user's local changes to the snapshot so that their updates
      // are not overwritten.
      if (this.pendingUpdates.size > 0) {
        applyUpdates(data, Object.fromEntries(this.pendingUpdates));
      }
      this.store.setData(data);
    });
  }

  /**
   * Stops listening for changes and saves any pending data to the db.
   */
  stop() {
    if (!this.started) {
      return;
    }
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
    return this.on(DraftDocEventType.CHANGE, callback);
  }

  /**
   * Adds a listener for save state change events.
   */
  onSaveStateChange(callback: (saveState: SaveState) => void) {
    return this.on(DraftDocEventType.SAVE_STATE_CHANGE, callback);
  }

  /**
   * Adds a listener for db write events.
   */
  onFlush(callback: () => void) {
    return this.on(DraftDocEventType.FLUSH, callback);
  }

  /**
   * Subscribes to remote changes for a given key. Returns a callback function
   * that can be used to unsubscribe.
   */
  subscribe(key: string, callback: SubscribeCallback): UnsubscribeCallback {
    return this.store.subscribe(key, callback);
  }

  getData(): CMSDoc | null {
    return this.store.getDataSnapshot() as CMSDoc | null;
  }

  getValue(key: string): any {
    // return getNestedValue(this.cachedData, key);
    return this.store.get(key);
  }

  /**
   * Updates a single key. The key can be a nested key, e.g. "meta.title".
   */
  async updateKey(key: string, value: any) {
    this.pendingUpdates.set(key, value);
    this.store.set(key, value);
    this.setSaveState(SaveState.UPDATES_PENDING);
    this.queueChanges();
  }

  /**
   * Updates a group of keys. The keys can be a nested, e.g. "meta.title".
   */
  async updateKeys(updates: Record<string, any>) {
    for (const key in updates) {
      const val = updates[key];
      if (val === null || val === undefined) {
        // Firestore doesn't support `undefined`, so use deleteField() instead.
        // NOTE(stevenle): this doesn't currently handle nested `undefined`
        // values.
        this.pendingUpdates.set(key, deleteField());
      } else {
        this.pendingUpdates.set(key, val);
      }
    }
    this.store.update(updates);
    this.setSaveState(SaveState.UPDATES_PENDING);
    this.queueChanges();
  }

  /**
   * Removes a key.
   */
  async removeKey(key: string) {
    this.pendingUpdates.set(key, deleteField());
    this.store.set(key, undefined);
    this.setSaveState(SaveState.UPDATES_PENDING);
    this.queueChanges();
  }

  /**
   * Queues changes using a debounce function. This function can be called any
   * number of times, and the write will go through N seconds after the last
   * update.
   */
  private queueChanges = debounce(() => this.flush(), SAVE_DELAY);

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
      }, SAVE_DELAY);
    }

    this.dispatch(DraftDocEventType.SAVE_STATE_CHANGE, newSaveState);
  }

  removePublishingLock() {
    // Prevent autolocking since this method would only be called if the user
    // explicitly unlocks the publishing.
    this.autolockApplied = true;
    this.removeKey('sys.publishingLocked');
    this.flush();
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

    // If autolock is enabled on the collection, add a publishing lock if one
    // doesn't already exist on the doc.
    if (
      this.autolock &&
      !this.autolockApplied &&
      !this.store.get('sys.publishingLocked')
    ) {
      this.autolockApplied = true;
      updates['sys.publishingLocked'] = {
        lockedAt: serverTimestamp(),
        lockedBy: window.firebase.user.email,
        reason: this.autolockReason,
      };
    }

    // Immediately clear the pending updates so that there's no race condition
    // with any new updates the user makes while the changes are being saved to
    // the db. If the db save fails for any reason, re-apply the pending updates
    // and re-queue the db save.
    this.pendingUpdates.clear();
    try {
      this.setSaveState(SaveState.SAVING);
      await updateDoc(this.docRef, updates);
      this.setSaveState(SaveState.SAVED);
      this.dispatch(DraftDocEventType.FLUSH);
      logAction('doc.save', {
        metadata: {docId: this.docId},
        throttle: SAVE_ACTION_LOG_THROTTLE,
        throttleId: this.docId,
      });
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
        console.log(this.pendingUpdates);
      }
    }
  }

  getLocales(): string[] {
    const locales = this.store.get('sys.locales');
    if (locales) {
      return locales;
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

function splitKey(key: string) {
  const index = key.indexOf('.');
  const head = key.substring(0, index);
  const tail = key.substring(index + 1);
  return [head, tail] as const;
}

export interface DraftDocProviderProps {
  docId: string;
  children?: ComponentChildren;
}

export interface DraftDocContext {
  loading: boolean;
  controller: DraftDocController;
}

const DRAFT_DOC_CONTEXT = createContext<DraftDocContext | null>(null);

/**
 * Context provider that provides a DraftDocController instance.
 */
export function DraftDocProvider(props: DraftDocProviderProps) {
  const [loading, setLoading] = useState(true);

  const controller = useMemo(
    () => new DraftDocController(props.docId),
    [props.docId]
  );

  useEffect(() => {
    setLoading(true);
    controller.onChange((data: CMSDoc) => {
      setLoading(false);
      setDocToCache(data.id, data);
    });
    controller.start();
    return () => controller.dispose();
  }, [controller]);

  // Automatically start/stop the db watcher N seconds after the browser
  // visibility state changes.
  useEffect(() => {
    const onVisibilityChange = () => {
      let visibilityTimeoutId: number | undefined;
      if (document.hidden || document.visibilityState !== 'visible') {
        visibilityTimeoutId = window.setTimeout(() => {
          controller.stop();
        }, VISIBILITY_TIMEOUT);
      } else {
        if (visibilityTimeoutId) {
          clearTimeout(visibilityTimeoutId);
          visibilityTimeoutId = undefined;
        }
        if (!controller.started) {
          setLoading(true);
          controller.start();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [controller]);

  return (
    <DRAFT_DOC_CONTEXT.Provider value={{loading, controller}}>
      {props.children}
    </DRAFT_DOC_CONTEXT.Provider>
  );
}

export interface DraftDocContextProviderProps {
  value: DraftDocContext;
  children?: ComponentChildren;
}

export function DraftDocContextProvider(props: DraftDocContextProviderProps) {
  return (
    <DRAFT_DOC_CONTEXT.Provider value={props.value}>
      {props.children}
    </DRAFT_DOC_CONTEXT.Provider>
  );
}

export function useDraftDoc(): DraftDocContext {
  const value = useContext(DRAFT_DOC_CONTEXT);
  if (!value) {
    throw new Error('useDraftDoc() should be used within a <DraftDocProvider>');
  }
  return value;
}

/**
 * Hook for subscribing to changes to a draft doc's save state.
 */
export function useDraftDocSaveState(cb: (saveState: SaveState) => void) {
  const {controller} = useDraftDoc();
  useEffect(() => {
    return controller.onSaveStateChange(cb);
  }, [controller]);
}

/**
 * Hook for subscribing to all data changes to a draft doc.
 */
export function useDraftDocData(cb: (data: CMSDoc) => void) {
  const {controller} = useDraftDoc();
  useEffect(() => {
    return controller.onChange(cb);
  }, [controller]);
}

/**
 * Hook for subscribing to changes to a specific field in a doc.
 *
 * ```
 * useDraftDocFieldData('fields.meta.title', (title) => {
 *   console.log(`title: ${title}`);
 * })
 * ```
 */
export function useDraftDocField<T>(deepKey: string, cb: (data: T) => void) {
  const {controller} = useDraftDoc();
  useEffect(() => {
    return controller.subscribe(deepKey, cb);
  }, [controller]);
}

/**
 * A hook with a similar interface as `useState()` that manages the state of a
 * value within a draft doc.
 */
export function useDraftDocValue<T>(deepKey: string, defaultValue?: T) {
  const {controller} = useDraftDoc();
  const [value, setValue] = useState<T>(
    controller.getValue(deepKey) ?? defaultValue
  );

  useEffect(() => {
    return controller.subscribe(deepKey, (newValue: T) => {
      setValue(newValue);
    });
  }, [controller]);

  const setDraftValue = (newValue: T) => {
    setValue(newValue);
    if (newValue === null || newValue === undefined) {
      controller.removeKey(deepKey);
    } else {
      controller.updateKey(deepKey, newValue);
    }
  };

  return [value, setDraftValue] as const;
}
