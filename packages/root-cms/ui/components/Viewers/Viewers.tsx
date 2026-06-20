import {Avatar} from '@mantine/core';
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
import {useContext, useEffect, useMemo, useState} from 'preact/hooks';
import {normalizeSlug} from '../../../shared/slug.js';
import {debounce} from '../../utils/debounce.js';
import {EventListener} from '../../utils/events.js';
import {throttle} from '../../utils/throttle.js';
import {TIME_UNITS} from '../../utils/time.js';
import {Timer} from '../../utils/timer.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';
import './Viewers.css';

// Frequency to update.
const UPDATE_INTERVAL = 60 * TIME_UNITS.second;

// Idle timeout for when no user interaction is detected.
const IDLE_TIMEOUT = 5 * TIME_UNITS.minute;

interface Viewer {
  email: string;
  photoURL: string;
  lastViewedAt: Timestamp;
  disconnectedAt: Timestamp;
  /** The `deepKey` of the field this viewer currently has focused, if any. */
  focusedField?: string;
}

export interface ViewersProps {
  /** Unique identifier for the page being viewed. */
  id: string;
  max?: number;
}

class ViewersController extends EventListener {
  readonly id: string;
  private docRef: DocumentReference;
  private dbUnsubscribe?: () => void;
  started = false;
  timer: Timer = new Timer(UPDATE_INTERVAL);
  idleTimer: Timer = new Timer(IDLE_TIMEOUT);
  private focusedField = '';

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
      const data = snapshot.data() as Record<string, Viewer>;
      this.onData(data);
    });
    this.onTick();
    this.timer.start();
  }

  private onData(data: Record<string, Viewer>) {
    const user = window.firebase.user;
    const now = Timestamp.now();
    const viewers: Viewer[] = Object.values(data).filter((viewer) => {
      // Ignore current user.
      if (viewer.email === user.email) {
        return false;
      }

      // Ignore viewers that haven't checked in within `IDLE_TIMEOUT`.
      const lastViewedDiff = now.toMillis() - viewer.lastViewedAt.toMillis();
      if (lastViewedDiff > IDLE_TIMEOUT) {
        return false;
      }

      return true;
    });
    this.dispatch('change', viewers);
  }

  private async onTick() {
    const user = window.firebase.user;
    if (!user.email) {
      console.log('no user email:', user);
      return;
    }
    // console.log(`updating lastViewedAt for ${user.email}`);
    await setDoc(
      this.docRef,
      {
        [user.email]: {
          email: user.email,
          photoURL: user.photoURL,
          lastViewedAt: serverTimestamp(),
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

  /** Broadcasts the field (`deepKey`) the current user has focused. */
  setFocusedField(deepKey: string) {
    const value = deepKey || '';
    if (this.focusedField === value) {
      return;
    }
    this.focusedField = value;
    this.writeFocusedField();
  }

  private writeFocusedField = debounce(async () => {
    if (!this.started) {
      return;
    }
    const user = window.firebase.user;
    if (!user.email) {
      return;
    }
    await setDoc(
      this.docRef,
      {
        [user.email]: {
          email: user.email,
          photoURL: user.photoURL,
          focusedField: this.focusedField,
          lastViewedAt: serverTimestamp(),
        },
      },
      {merge: true}
    );
  }, 200);

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
    const fieldPath = new FieldPath(user.email, 'disconnectedAt');
    await updateDoc(this.docRef, fieldPath, serverTimestamp());
  }

  async dispose() {
    super.dispose();
    this.stop();
    this.timer.dispose();
    this.idleTimer.dispose();
  }
}

function isViewerDisconnected(viewer: Viewer) {
  if (!viewer.disconnectedAt) {
    return false;
  }
  return viewer.disconnectedAt > viewer.lastViewedAt;
}

interface ViewersContextValue {
  viewers: Viewer[];
  controller: ViewersController | null;
  /** The `deepKey` of the field the current user currently has focused. */
  currentFocusedField: string;
}

const ViewersContext = createContext<ViewersContextValue>({
  viewers: [],
  controller: null,
  currentFocusedField: '',
});

/**
 * Hook that wires up a {@link ViewersController} for the given page `id`. It
 * keeps the list of other active viewers up to date and tracks which field the
 * current user has focused so it can be broadcast to other viewers.
 */
function useViewersController(id: string): ViewersContextValue {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [controller, setController] = useState<ViewersController | null>(null);
  const [currentFocusedField, setCurrentFocusedField] = useState('');

  useEffect(() => {
    if (!id) {
      return;
    }
    const controller = new ViewersController(id);
    setController(controller);
    controller.on('change', (viewers: Viewer[]) => setViewers(viewers));
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

    // Broadcast which field the current user has focused so other viewers can
    // render a presence indicator next to it.
    const getFocusedDeepKey = () => {
      const active = document.activeElement;
      if (!active) {
        return '';
      }
      const fieldEl = active.closest('.DocEditor__field');
      return fieldEl?.id || '';
    };
    const updateFocusedField = () => {
      const deepKey = getFocusedDeepKey();
      controller.setFocusedField(deepKey);
      setCurrentFocusedField(deepKey);
    };
    const onFocusIn = () => updateFocusedField();
    const onFocusOut = () => {
      // Defer so `document.activeElement` reflects the newly focused element.
      window.setTimeout(() => {
        updateFocusedField();
      }, 0);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      controller.dispose();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      setController(null);
      setCurrentFocusedField('');
    };
  }, [id]);

  return {viewers, controller, currentFocusedField};
}

/**
 * Provides viewer presence (including per-field focus) to descendants. Wrap the
 * doc editor with this so individual fields can render presence indicators.
 */
export function ViewersProvider(props: {
  id: string;
  children: ComponentChildren;
}) {
  const id = normalizeSlug(props.id);
  const value = useViewersController(id);
  return (
    <ViewersContext.Provider value={value}>
      {props.children}
    </ViewersContext.Provider>
  );
}

export interface FieldViewer {
  email: string;
  /** Whether this viewer is the current (signed-in) user. */
  isCurrentUser: boolean;
}

/**
 * Returns the viewers who currently have the field identified by `deepKey`
 * focused. The current user is only included when at least one *other* viewer
 * is also focused on the same field (so we never show your own avatar when
 * you're the only one on the field).
 */
export function useFieldViewers(deepKey: string): FieldViewer[] {
  const {viewers, currentFocusedField} = useContext(ViewersContext);
  return useMemo(() => {
    if (!deepKey) {
      return [];
    }
    const others = viewers.filter(
      (viewer) =>
        viewer.focusedField === deepKey && !isViewerDisconnected(viewer)
    );
    if (others.length === 0) {
      return [];
    }
    const result: FieldViewer[] = others.map((viewer) => ({
      email: viewer.email,
      isCurrentUser: false,
    }));
    // Include the current user's avatar when they share this field with at
    // least one other viewer.
    if (currentFocusedField === deepKey) {
      const currentEmail = window.firebase.user?.email || '';
      if (currentEmail) {
        result.unshift({email: currentEmail, isCurrentUser: true});
      }
    }
    return result;
  }, [viewers, deepKey, currentFocusedField]);
}

/**
 * Displays avatars viewing the current page. When rendered inside a
 * {@link ViewersProvider} it reuses the shared controller; otherwise it spins
 * up its own controller (e.g. for standalone usage).
 */
export function Viewers(props: ViewersProps) {
  const id = normalizeSlug(props.id);
  const context = useContext(ViewersContext);
  const standalone = useViewersController(context.controller ? '' : id);
  const viewers = context.controller ? context.viewers : standalone.viewers;

  if (viewers.length === 0) {
    return null;
  }

  // Use plain CSS instead of `AvatarsGroup` because that
  // component doesn't support using Tooltips as children.
  const limit = props.max || 3;
  const visibleViewers = viewers.slice(0, limit);
  const overflow = viewers.length - limit;

  return (
    <div className="Viewers">
      {visibleViewers.map((viewer) => (
        <UserAvatar
          key={viewer.email}
          email={viewer.email}
          size={30}
          inactive={isViewerDisconnected(viewer)}
          className="Viewers__avatar"
        />
      ))}
      {overflow > 0 && (
        <Avatar className="Viewers__avatar" size={30} radius="xl">
          +{overflow}
        </Avatar>
      )}
    </div>
  );
}
