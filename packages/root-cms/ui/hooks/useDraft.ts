import {useEffect, useState} from 'preact/hooks';
import {
  doc,
  DocumentReference,
  Firestore,
  onSnapshot,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import {debounce} from '../utils/debounce.js';

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
      console.log('onSnapshot()', data);
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
   * Updates a key.
   */
  async updateKey(key: string, newValue: any) {
    console.log('updateKey()', key, newValue);
    this.pendingUpdates[`fields.${key}`] = newValue;
    // await updateDoc(this.docRef, `fields.${key}`, newValue);
    this.queueChanges();
  }

  /**
   * Queues changes using a debounce function. This function can be called any
   * number of times, and the write will go through N seconds after the last
   * update.
   */
  private queueChanges = debounce(() => this.flush(), 3000);

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

export function useDraft(docId: string) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({});
  const draft = new DraftController(docId);

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
