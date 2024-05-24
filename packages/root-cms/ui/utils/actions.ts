import {
  Timestamp,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import {DataSource} from './data-source.js';
import {timestamp} from './time.js';

/** A map of when an action was last called. */
const ACTION_TIMESTAMPS: Record<string, number> = {};

export interface Action {
  action: string;
  metadata: any;
  timestamp: Timestamp;
  by: string;
}

export async function logAction(
  action: string,
  options?: {metadata?: any; throttle?: number; throttleId?: string}
) {
  // Certain actions like "doc.save" should be throttled so that only 1 action
  // is logged per N milliseconds.
  const throttle = options?.throttle || 0;
  const actionKey = options?.throttleId
    ? `${action}::${options.throttleId}`
    : action;
  if (isThrottled(actionKey, throttle)) {
    return;
  }

  const res = await fetch('/cms/api/actions.log', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({action: action, metadata: options?.metadata || {}}),
  });
  if (res.status !== 200) {
    const err = await res.text();
    console.error(`failed to log action "${action}":`, err);
    return;
  }

  // Save a timestamp of when the action was last called.
  ACTION_TIMESTAMPS[actionKey] = timestamp();
}

export interface ListActionsOptions {
  limit?: number;
}

export async function listActions(options: ListActionsOptions) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const colRef = collection(db, 'Projects', projectId, 'ActionLogs');
  const q = query(
    colRef,
    orderBy('timestamp', 'desc'),
    limit(options?.limit || 20)
  );
  const querySnapshot = await getDocs(q);
  const res: Action[] = [];
  querySnapshot.forEach((doc) => {
    res.push(doc.data() as Action);
  });
  return res;
}

function isThrottled(actionKey: string, millis: number): boolean {
  if (millis === 0) {
    return false;
  }

  const lastCalled = ACTION_TIMESTAMPS[actionKey];
  if (!lastCalled) {
    return false;
  }

  const now = timestamp();
  return now - lastCalled < millis;
}
