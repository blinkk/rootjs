import {Avatar, Tooltip} from '@mantine/core';
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
import {useEffect, useState} from 'preact/hooks';
import {normalizeSlug} from '../../../shared/slug.js';
import {joinClassNames} from '../../utils/classes.js';
import {EventListener} from '../../utils/events.js';
import {throttle} from '../../utils/throttle.js';
import {TIME_UNITS} from '../../utils/time.js';
import {Timer} from '../../utils/timer.js';
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

/**
 * Displays avatars viewing the current page.
 */
export function Viewers(props: ViewersProps) {
  const id = normalizeSlug(props.id);
  const [viewers, setViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    const controller = new ViewersController(id);
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
    return () => {
      controller.dispose();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [id]);

  if (viewers.length === 0) {
    return null;
  }

  function isViewerDisconnected(viewer: Viewer) {
    if (!viewer.disconnectedAt) {
      return false;
    }
    return viewer.disconnectedAt > viewer.lastViewedAt;
  }

  // Use plain CSS instead of `AvatarsGroup` because that
  // component doesn't support using Tooltips as children.
  const limit = props.max || 3;
  const visibleViewers = viewers.slice(0, limit);
  const overflow = viewers.length - limit;

  return (
    <div className="Viewers">
      {visibleViewers.map((viewer) => {
        if (!viewer.photoURL) {
          const initial = viewer.email[0].toUpperCase();
          return (
            <Tooltip
              key={viewer.email}
              label={viewer.email}
              position="bottom"
              withArrow
            >
              <Avatar
                className="Viewers__avatar"
                alt={viewer.email}
                size={30}
                radius="xl"
              >
                {initial}
              </Avatar>
            </Tooltip>
          );
        }
        return (
          <Tooltip
            key={viewer.email}
            label={viewer.email}
            position="bottom"
            withArrow
          >
            <Avatar
              className={joinClassNames(
                'Viewers__viewer',
                'Viewers__avatar',
                isViewerDisconnected(viewer) && 'Viewers__viewer--disconnected'
              )}
              src={viewer.photoURL}
              alt={viewer.email}
              size={30}
              radius="xl"
            />
          </Tooltip>
        );
      })}
      {overflow > 0 && (
        <Avatar className="Viewers__avatar" size={30} radius="xl">
          +{overflow}
        </Avatar>
      )}
    </div>
  );
}
