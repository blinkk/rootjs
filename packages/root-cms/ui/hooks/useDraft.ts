import {useEffect, useMemo, useState} from 'preact/hooks';
import {
  doc,
  DocumentReference,
  Firestore,
  onSnapshot,
  updateDoc,
  Timestamp,
  deleteField,
} from 'firebase/firestore';
import {debounce} from '../utils/debounce.js';

const SAVE_DELAY_MS = 3 * 1000;

export class DraftController {
  readonly projectId: string;
  readonly collectionId: string;
  readonly slug: string;
  private db: Firestore;
  private docRef: DocumentReference;

  private pendingUpdates: Record<string, any> = {};
  private onChangeCallback?: (data: any) => void;
  private dbUnsubscribe?: () => void;

  constructor(docId: string) {
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
    console.log('start()');
    this.dbUnsubscribe = onSnapshot(this.docRef, (snapshot) => {
      const data = snapshot.data();
      console.log(this.pendingUpdates);
      // Save the user's local changes to the snapshot so that their updates
      // are not overwritten.
      if (Object.keys(this.pendingUpdates).length > 0) {
        applyUpdates(data, this.pendingUpdates);
      }
      console.log('onSnapshot()', data, this.pendingUpdates);
      if (this.onChangeCallback) {
        this.onChangeCallback(data);
      }
    });
  }

  /**
   * Stops listening for changes.
   */
  stop() {
    console.log('stop()');
    if (this.dbUnsubscribe) {
      this.dbUnsubscribe();
    }
  }

  /**
   * Listen for changes.
   */
  onChange(callback: (data: any) => void) {
    this.onChangeCallback = callback;
  }

  /**
   * Updates a key. The key can be a nested key, e.g. "meta.title".
   */
  async updateKey(key: string, newValue: any) {
    console.log('updateKey()', key, newValue);
    this.pendingUpdates[`fields.${key}`] = newValue;
    this.queueChanges();
  }

  /**
   * Removes a key.
   */
  async removeKey(key: string) {
    this.updateKey(key, deleteField());
  }

  /**
   * Queues changes using a debounce function. This function can be called any
   * number of times, and the write will go through N seconds after the last
   * update.
   */
  private queueChanges = debounce(() => this.flush(), SAVE_DELAY_MS);

  /**
   * Immediately write all queued data to the DB.
   */
  async flush() {
    const updates = this.pendingUpdates;
    updates['sys.modifiedAt'] = Timestamp.now();
    updates['sys.modifiedBy'] = window.firebase.user.email;
    console.log('flush()', updates);
    this.pendingUpdates = {};
    await updateDoc(this.docRef, updates);
  }

  /**
   * Stops all listeners and disposes the controller.
   */
  dispose() {
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
      data[key] = val;
    }
  }
}

function splitKey(key: string) {
  const index = key.indexOf('.');
  const head = key.substring(0, index);
  const tail = key.substring(index + 1);
  return [head, tail] as const;
}

export function useDraft(docId: string) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({});
  const draft = useMemo(() => new DraftController(docId), []);

  useEffect(() => {
    draft.onChange((data: any) => {
      setData(data);
      setLoading(false);
    });
    draft.start();
    return () => draft.dispose();
  }, []);

  return {loading, draft, data};
}
