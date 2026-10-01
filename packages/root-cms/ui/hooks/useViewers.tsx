import {
  DocumentReference,
  FieldPath,
  Timestamp,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {ComponentChildren, createContext} from 'preact';
import {useContext, useEffect, useState} from 'preact/hooks';
import {normalizeSlug} from '../../shared/slug.js';
import {debounce} from '../utils/debounce.js';
import {EventListener} from '../utils/events.js';
import {throttle} from '../utils/throttle.js';
import {TIME_UNITS} from '../utils/time.js';
import {Timer} from '../utils/timer.js';

// Frequency to update.
const UPDATE_INTERVAL = 60 * TIME_UNITS.second;

// Idle timeout for when no user interaction is detected.
const IDLE_TIMEOUT = 5 * TIME_UNITS.minute;

// Delay before persisting a focus change, so tabbing through fields doesn't
// trigger a db write for every field passed along the way.
const FOCUS_UPDATE_DELAY = 500;

/** A user that is viewing a page. */
export interface Viewer {
  email: string;
  photoURL: string;
  lastViewedAt: Timestamp;
  disconnectedAt?: Timestamp;
  /** Deep key of the field the viewer is focused on, if any. */
  focusedField?: string | null;
}

/**
 * Manages the current user's presence on a page and listens for other users
 * viewing the same page.
 */
export class ViewersController extends EventListener {
  readonly id: string;
  private docRef: DocumentReference;
  private dbUnsubscribe?: () => void;
  started = false;
  timer: Timer = new Timer(UPDATE_INTERVAL);
  idleTimer: Timer = new Timer(IDLE_TIMEOUT);
  /** Other users viewing the page. */
  viewers: Viewer[] = [];
  /** Deep key of the field the current user is focused on. */
  private focusedField: string | null = null;

  constructor(id: string) {
    super();
    this.id = id;
    const projectId = window.__ROOT_CTX.rootConfig.projectId;
    const db = window.firebase.db;
    this.docRef = doc(db, 'Projects', projectId, 'Viewers', id);
    this.timer.on('tick', () => this.onTick());
    this.idleTimer.on('tick', () => this.onIdle());
    window.addEventListener('mousemove', this.onUserInteraction);
    window.addEventListener('keypress', this.onUserInteraction);
  }

  async start() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.dbUnsubscribe = onSnapshot(this.docRef, (snapshot) => {
      const data = (snapshot.data() || {}) as Record<string, Viewer>;
      this.onData(data);
    });
    this.onTick();
    this.timer.start();
  }

  /**
   * Updates the field the current user is focused on. Pass `null` when no
   * field is focused.
   */
  setFocusedField(deepKey: string | null) {
    if (this.focusedField === deepKey) {
      return;
    }
    this.focusedField = deepKey;
    this.saveFocusedField();
  }

  private saveFocusedField = debounce(() => {
    if (this.started) {
      this.onTick();
    }
  }, FOCUS_UPDATE_DELAY);

  private onData(data: Record<string, Viewer>) {
    const user = window.firebase.user;
    const now = Timestamp.now();
    const viewers: Viewer[] = Object.values(data).filter((viewer) => {
      // Ignore current user.
      if (viewer.email === user.email) {
        return false;
      }

      // Ignore viewers that haven't checked in within `IDLE_TIMEOUT`.
      if (!viewer.lastViewedAt) {
        return false;
      }
      const lastViewedDiff = now.toMillis() - viewer.lastViewedAt.toMillis();
      if (lastViewedDiff > IDLE_TIMEOUT) {
        return false;
      }

      return true;
    });
    this.viewers = viewers;
    this.dispatch('change', viewers);
  }

  private async onTick() {
    const user = window.firebase.user;
    if (!user.email) {
      console.log('no user email:', user);
      return;
    }
    await setDoc(
      this.docRef,
      {
        [user.email]: {
          email: user.email,
          photoURL: user.photoURL,
          lastViewedAt: serverTimestamp(),
          focusedField: this.focusedField,
        },
      },
      {merge: true}
    );
  }

  private async onIdle() {
    this.stop();
  }

  private onUserInteraction = throttle(() => {
    this.idleTimer.reset();
  }, 5000);

  stop() {
    if (!this.started) {
      return;
    }
    if (this.dbUnsubscribe) {
      this.dbUnsubscribe();
    }
    this.timer.stop();
    this.idleTimer.stop();
    this.onDisconnect();
    this.started = false;
  }

  private async onDisconnect() {
    const user = window.firebase.user;
    if (!user.email) {
      console.log('no user email:', user);
      return;
    }
    await updateDoc(
      this.docRef,
      new FieldPath(user.email, 'disconnectedAt'),
      serverTimestamp(),
      new FieldPath(user.email, 'focusedField'),
      null
    );
  }

  async dispose() {
    super.dispose();
    this.stop();
    this.timer.dispose();
    this.idleTimer.dispose();
    window.removeEventListener('mousemove', this.onUserInteraction);
    window.removeEventListener('keypress', this.onUserInteraction);
  }
}

/** Returns true if the viewer has left the page since their last check-in. */
export function isViewerDisconnected(viewer: Viewer): boolean {
  if (!viewer.disconnectedAt || !viewer.lastViewedAt) {
    return false;
  }
  return viewer.disconnectedAt.toMillis() > viewer.lastViewedAt.toMillis();
}

/** Returns the field a viewer is actively focused on, if any. */
export function getViewerFocusedField(viewer: Viewer): string | null {
  if (isViewerDisconnected(viewer)) {
    return null;
  }
  return viewer.focusedField || null;
}

const VIEWERS_CONTEXT = createContext<ViewersController | null>(null);

export interface ViewersProviderProps {
  /** Unique identifier for the page being viewed. */
  id: string;
  children?: ComponentChildren;
}

/**
 * Tracks the users viewing a page (e.g. `doc/Pages/foo`) and makes them
 * available to descendants through `useViewers()` and `useFieldViewers()`.
 */
export function ViewersProvider(props: ViewersProviderProps) {
  const id = normalizeSlug(props.id);
  const [controller, setController] = useState<ViewersController | null>(null);

  useEffect(() => {
    const controller = new ViewersController(id);
    setController(controller);
    controller.start();
    const onVisibilityChange = () => {
      if (document.hidden || document.visibilityState !== 'visible') {
        controller.stop();
      } else {
        if (!controller.started) {
          controller.start();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      controller.dispose();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [id]);

  return (
    <VIEWERS_CONTEXT.Provider value={controller}>
      {props.children}
    </VIEWERS_CONTEXT.Provider>
  );
}

/**
 * Returns the controller from the nearest `ViewersProvider`, or `null` when
 * there isn't one (e.g. embedded editors that don't track presence).
 */
export function useViewersController(): ViewersController | null {
  return useContext(VIEWERS_CONTEXT);
}

/** Returns the other users viewing the current page. */
export function useViewers(): Viewer[] {
  const controller = useViewersController();
  const [viewers, setViewers] = useState<Viewer[]>(
    () => controller?.viewers || []
  );
  useEffect(() => {
    if (!controller) {
      setViewers([]);
      return;
    }
    setViewers(controller.viewers);
    return controller.on('change', (viewers: Viewer[]) => setViewers(viewers));
  }, [controller]);
  return viewers;
}

/**
 * Returns the other users that are focused on the field at `deepKey`. Only
 * re-renders when the set of viewers on the field changes, so it's cheap to
 * call from every field in the editor.
 */
export function useFieldViewers(deepKey: string): Viewer[] {
  const controller = useViewersController();
  const [viewers, setViewers] = useState<Viewer[]>([]);
  useEffect(() => {
    if (!controller || !deepKey) {
      setViewers([]);
      return;
    }
    let currentKey = '';
    const update = (allViewers: Viewer[]) => {
      const fieldViewers = allViewers.filter(
        (viewer) => getViewerFocusedField(viewer) === deepKey
      );
      const key = fieldViewers.map((viewer) => viewer.email).join(',');
      if (key !== currentKey) {
        currentKey = key;
        setViewers(fieldViewers);
      }
    };
    update(controller.viewers);
    return controller.on('change', update);
  }, [controller, deepKey]);
  return viewers;
}
