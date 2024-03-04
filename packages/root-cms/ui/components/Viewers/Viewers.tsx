import {Avatar, AvatarsGroup} from '@mantine/core';
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
import {EventListener} from '../../utils/events.js';
import {normalizeSlug} from '../../utils/slug.js';
import {throttle} from '../../utils/throttle.js';
import {TIME_UNITS} from '../../utils/time.js';
import {Timer} from '../../utils/timer.js';

// Frequency to update.
const UPDATE_INTERVAL = 30 * TIME_UNITS.second;

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
    const viewers: Viewer[] = Object.values(data).filter((viewer) => {
      // Ignore current user.
      if (viewer.email === user.email) {
        return false;
      }
      // Ignore viewers that have already disconnected.
      if (viewer.disconnectedAt > viewer.lastViewedAt) {
        return false;
      }
      // Ignore viewers that haven't checked in within `IDLE_TIMEOUT`.
      // TODO(stevenle): fix.
      // const now = Math.floor(new Date().getTime());
      // if (now - viewer.lastViewedAt.toMillis() > IDLE_TIMEOUT) {
      //   return false;
      // }
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
    console.log(`updating lastViewedAt for ${user.email}`);
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

  return (
    <AvatarsGroup className="Viewers" limit={3} size={30}>
      {viewers.map((viewer) => {
        if (!viewer.photoURL) {
          const initial = viewer.email[0].toUpperCase();
          return (
            <Avatar alt={viewer.email} size={24} radius="xl">
              {initial}
            </Avatar>
          );
        }
        return (
          <Avatar
            key={viewer.email}
            src={viewer.photoURL}
            alt={viewer.email}
            size={24}
            radius="xl"
          />
        );
      })}
    </AvatarsGroup>
  );
}
