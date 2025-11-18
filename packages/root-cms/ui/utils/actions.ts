import {
  Timestamp,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import {DataSource} from './data-source.js';
import {TIME_UNITS, timestamp} from './time.js';

/** A map of when an action was last called. */
const ACTION_TIMESTAMPS: Record<string, number> = {};

export interface Action {
  action: string;
  metadata: any;
  timestamp: Timestamp;
  by: string;
  links?: {label: string; url: string; target?: string}[];
}

export async function logAction(
  action: string,
  options?: {
    metadata?: any;
    throttle?: number;
    throttleId?: string;
    links?: {label: string; url: string; target?: string}[];
  }
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
    body: JSON.stringify({
      action: action,
      metadata: options?.metadata || {},
      links: options?.links,
    }),
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
  const numActions = options?.limit || 40;
  // Request 1.5x the number of actions since we may be filtering some.
  const queryLimit = Math.ceil(numActions * 1.5);
  const q = query(colRef, orderBy('timestamp', 'desc'), limit(queryLimit));
  const querySnapshot = await getDocs(q);
  const actions: Action[] = [];
  function shouldSkipAction(action: Action) {
    if (actions.length === 0) {
      return false;
    }
    // Skip multiple "doc.save" actions that occur within 60 mins.
    const prevAction = actions.at(-1)!;
    return (
      action.action === 'doc.save' &&
      prevAction.action === 'doc.save' &&
      action.by === prevAction.by &&
      action.metadata.docId === prevAction.metadata.docId &&
      action.timestamp.toMillis() - prevAction.timestamp.toMillis() <
        60 * TIME_UNITS.minute
    );
  }
  let count = 0;
  for (const doc of querySnapshot.docs) {
    if (count >= numActions) {
      break;
    }
    const action = doc.data() as Action;
    if (shouldSkipAction(action)) {
      continue;
    }
    actions.push(action);
    count += 1;
  }
  return actions;
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
