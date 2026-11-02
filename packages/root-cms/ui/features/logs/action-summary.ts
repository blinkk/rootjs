/**
 * @fileoverview Turns logged actions into copy for people, e.g.
 * `doc.publish` into "Kenji published doc Pages/index". The stored action ids
 * and metadata aren't changed: they're still what notification rules, search
 * and the full logs table work from.
 */

import {Timestamp} from 'firebase/firestore';
import {TaskMetadataChange, formatTaskMetadataChange} from '../tasks/tasks.js';
import {Action} from './actions.js';

/**
 * A sentence describing an action, in parts so that the UI can style them:
 * `{subject} {verb} {target}{tail}`. The subject defaults to the user that
 * performed the action.
 */
export interface ActionPhrase {
  subject?: string;
  verb: string;
  /** The id or path the action applied to. */
  target?: string;
  /** Text that follows the target, including any leading space. */
  tail?: string;
}

/** A labeled value in an action's expanded details. */
export interface ActionDetail {
  label: string;
  value: string;
  /** Marks a value worth noticing, e.g. docs a rollback overwrote. */
  warning?: boolean;
}

type Metadata = Record<string, any>;

/** Sync providers by id, so that the sync provider code stays out of this. */
const SYNC_PROVIDER_LABELS: Record<string, string> = {
  figma: 'Figma',
  gdrive: 'Google Drive',
};

/** Returns e.g. "1 doc" or "3 docs". */
function pluralize(count: unknown, noun: string) {
  const num = Number(count) || 0;
  return `${num} ${noun}${num === 1 ? '' : 's'}`;
}

/** Formats an id-like value for a sentence, e.g. `in-review` as "In review". */
function humanize(value: unknown) {
  const text = String(value ?? '').replace(/[-_]+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function syncProvider(metadata: Metadata) {
  return SYNC_PROVIDER_LABELS[metadata.provider] || humanize(metadata.provider);
}

function defaultTaskAssignee(metadata: Metadata): ActionPhrase {
  return metadata.assignee
    ? {verb: 'set the default task assignee to', target: metadata.assignee}
    : {verb: 'cleared the default task assignee', target: ''};
}

/** Returns the phrase for a comment action on a field of a doc. */
function fieldComment(metadata: Metadata, verb: string): ActionPhrase {
  const field = metadata.fieldLabel || metadata.fieldKey;
  return {verb: field ? `${verb} ${field} in` : verb};
}

/**
 * The phrases for the CMS's own actions. A phrase's target defaults to the
 * value from `getActionTarget()`. Keep this in sync with the `logAction()`
 * calls in the CMS; an action that's missing shows its id instead.
 */
const ACTION_PHRASES: Record<
  string,
  string | ((metadata: Metadata) => ActionPhrase)
> = {
  'doc.archive': 'archived doc',
  'doc.assign_sort_keys': (metadata) => ({
    verb: `set the order of ${pluralize(metadata.count, 'doc')} in`,
    target: metadata.collectionId,
  }),
  'doc.comment.add': (metadata) => fieldComment(metadata, 'commented on'),
  'doc.comment.delete': (metadata) =>
    fieldComment(metadata, 'deleted a comment on'),
  'doc.comment.edit': (metadata) =>
    fieldComment(metadata, 'edited a comment on'),
  'doc.comment.reopen': (metadata) =>
    fieldComment(metadata, 'reopened a comment on'),
  'doc.comment.resolve': (metadata) =>
    fieldComment(metadata, 'resolved a comment on'),
  'doc.create': 'created doc',
  'doc.delete': 'deleted doc',
  'doc.export_to_sheet': () => ({
    verb: 'exported doc',
    tail: ' to a Google Sheet',
  }),
  'doc.export_translations': 'exported translations for',
  'doc.import_translations': 'imported translations into',
  'doc.link_sheet': 'linked a Google Sheet to',
  'doc.lock_publishing': 'locked publishing on',
  'doc.publish': 'published doc',
  'doc.reorder': 'reordered doc',
  'doc.restore_version': 'restored a previous version of',
  'doc.revert': () => ({
    verb: 'reverted doc',
    tail: ' to its published version',
  }),
  'doc.save': 'edited doc',
  'doc.schedule': () => ({verb: 'scheduled doc', tail: ' to publish'}),
  'doc.scheduled_publish': () => ({
    verb: 'published doc',
    tail: ' on schedule',
  }),
  'doc.unarchive': 'unarchived doc',
  'doc.unlink_sheet': 'unlinked the Google Sheet from',
  'doc.unlock_publishing': 'unlocked publishing on',
  'doc.unpublish': 'unpublished doc',
  'doc.unschedule': 'unscheduled doc',

  'release.archive': 'archived release',
  'release.create': 'created release',
  'release.delete': 'deleted release',
  'release.publish': 'published release',
  'release.rollback': 'rolled back release',
  'release.save': 'edited release',
  'release.schedule': () => ({verb: 'scheduled release', tail: ' to publish'}),
  'release.scheduled_publish': () => ({
    verb: 'published release',
    tail: ' on schedule',
  }),
  'release.unarchive': 'unarchived release',
  'release.unschedule': 'unscheduled release',

  'datasource.archive': 'archived data source',
  'datasource.create': 'created data source',
  'datasource.cron_sync': () => ({
    subject: 'Scheduled sync',
    verb: 'updated data source',
  }),
  'datasource.delete': 'deleted data source',
  'datasource.publish': 'published data source',
  'datasource.save': 'edited data source',
  'datasource.sync': 'synced data source',
  'datasource.unarchive': 'unarchived data source',
  'datasource.unpublish': 'unpublished data source',

  'asset.alt_disabled': (metadata) => ({
    verb: `turned ${metadata.disabled ? 'off' : 'on'} alt text for`,
  }),
  'asset.delete': (metadata) => ({
    verb: metadata.folder ? 'deleted folder' : 'deleted asset',
  }),
  'asset.folder_create': 'created folder',
  'asset.folder_update': 'updated settings for folder',
  'asset.move': (metadata) => ({
    verb: metadata.assetId ? 'moved asset' : `moved folder ${metadata.from} to`,
  }),
  'asset.rename': (metadata) => ({
    verb: `renamed ${metadata.from} to`,
  }),
  'asset.replace': 'replaced asset',
  'asset.sync': (metadata) => ({
    verb: `updated ${pluralize(metadata.docIds?.length, 'doc')} to use`,
  }),
  'asset.sync_connect': (metadata) => ({
    verb: 'connected folder',
    tail: ` to ${syncProvider(metadata)}`,
  }),
  'asset.sync_disconnect': (metadata) => ({
    verb: 'disconnected folder',
    tail: ` from ${syncProvider(metadata)}`,
  }),
  'asset.sync_run': (metadata) => ({
    verb: 'synced folder',
    tail: ` from ${syncProvider(metadata)}`,
  }),
  'asset.upload': 'uploaded',

  'translations.batch_save': (metadata) => ({
    verb: `edited ${pluralize(metadata.count, 'translation')}`,
    target: '',
  }),
  'translations.delete': 'deleted translations',
  'translations.port': (metadata) => ({
    verb: 'copied translations for',
    tail: ` from ${metadata.fromSource} to ${metadata.toSource}`,
  }),
  'translations.publish': 'published translations',
  'translations.save': () => ({verb: 'edited a translation', target: ''}),
  'translations.save_draft': 'saved a draft of translations',
  'translations.unpublish': 'unpublished translations',

  'tasks.attachment.add': (metadata) => ({
    verb: `added ${metadata.filename} to task`,
  }),
  'tasks.attachment.remove': 'removed an attachment from task',
  'tasks.comment.add': 'commented on task',
  'tasks.comment.delete': 'deleted a comment on task',
  'tasks.comment.edit': 'edited a comment on task',
  'tasks.create': 'created task',
  'tasks.default_assignee': defaultTaskAssignee,
  'tasks.delete': 'deleted task',
  'tasks.restore': 'restored task',
  'tasks.update_description': 'edited the description of task',
  'tasks.update_metadata': (metadata) => {
    if (!metadata.field) {
      return {verb: 'updated task'};
    }
    const {field, from, to} = formatTaskMetadataChange(
      metadata as TaskMetadataChange
    );
    return {
      verb: 'changed task',
      tail: ` ${field.toLowerCase()} from ${from} to ${to}`,
    };
  },

  // Older logs, from before task ids were snake_case and metadata changes
  // were logged as `tasks.update_metadata`.
  'tasks.defaultAssignee': defaultTaskAssignee,
  'tasks.updateAssignee': (metadata) =>
    metadata.assignee
      ? {verb: 'assigned task', tail: ` to ${metadata.assignee}`}
      : {verb: 'unassigned task'},
  'tasks.updateCc': 'updated who is CCed on task',
  'tasks.updateDescription': 'edited the description of task',
  'tasks.updatePriority': (metadata) => ({
    verb: 'set task',
    tail: ` to ${humanize(metadata.priority)} priority`,
  }),
  'tasks.updateStatus': (metadata) => ({
    verb: 'moved task',
    tail: ` to ${humanize(metadata.status)}`,
  }),
  'tasks.updateTargetLaunch': 'changed the target launch of task',
  'tasks.updateTitle': 'renamed task',

  'acls.save_groups': (metadata) => ({
    verb: `updated sharing for ${pluralize(
      metadata.groupCount,
      'group'
    )} and ${pluralize(metadata.userCount, 'user')}`,
    target: '',
  }),
  'user.reset_sign_in': (metadata) => ({
    verb: 'reset sign-in for',
    target: metadata.email,
  }),
};

/** Metadata shown in the expanded details of the CMS's own actions. */
const DETAIL_LABELS: Record<string, string> = {
  publishMessage: 'Message',
  taskTitle: 'Task',
  content: 'Comment',
  mentions: 'Mentions',
  reason: 'Reason',
  scheduledAt: 'Publish date',
  until: 'Locked until',
  versionModifiedAt: 'Version from',
  versionModifiedBy: 'Version by',
  docIds: 'Docs',
  dataSourceIds: 'Data sources',
  overwritten: 'Overwritten',
  collections: 'Collections',
  autoPublish: 'Auto-publish',
  service: 'Service',
  locales: 'Locales',
  languages: 'Languages',
  numStrings: 'Strings',
};

/** Metadata values that are dates. */
const DATE_DETAILS = ['scheduledAt', 'until', 'versionModifiedAt'];

/**
 * The metadata keys that say what an action applied to, in order of
 * preference. Firestore doesn't preserve key order, and some actions log
 * several ids (e.g. a comment's `docId`, `collectionId` and `threadId`).
 */
const TARGET_ID_KEYS = [
  'docId',
  'releaseId',
  'datasourceId',
  'translationsId',
  'taskId',
  'assetId',
];

/** Names for the non-user values of an action's `by`. */
const SYSTEM_USERS: Record<string, string> = {
  cron: 'Scheduled job',
  system: 'System',
};

/** Returns whether the action was performed by a person's account. */
export function isUserAction(action: Action) {
  return Boolean(action.by?.includes('@'));
}

/** Returns the CMS's own phrase for an action, if it has one. */
function getBuiltInPhrase(action: Action) {
  return Object.hasOwn(ACTION_PHRASES, action.action)
    ? ACTION_PHRASES[action.action]
    : undefined;
}

/**
 * Returns the name to use for an action performed by something other than a
 * person's account. Custom actions can pass any string as `by`.
 */
export function getSystemUserName(by?: string) {
  if (!by) {
    return 'Someone';
  }
  return Object.hasOwn(SYSTEM_USERS, by) ? SYSTEM_USERS[by] : by;
}

/**
 * Returns the sentence for an action. In order of preference, that's:
 * 1. The `label` the action was logged with, for plugins' custom actions.
 * 2. The CMS's own phrase for the action.
 * 3. The action's id, for custom actions with no label.
 */
export function getActionPhrase(action: Action): ActionPhrase {
  const metadata = action.metadata || {};
  const target = getActionTarget(action);
  if (action.label) {
    return {verb: action.label, target};
  }
  const phrase = getBuiltInPhrase(action);
  if (!phrase) {
    return {
      verb: 'logged',
      target: action.action,
      tail: target ? ` for ${target}` : '',
    };
  }
  const result: ActionPhrase =
    typeof phrase === 'string' ? {verb: phrase} : phrase(metadata);
  return {
    target,
    ...result,
    tail:
      metadata.source === 'root-ai'
        ? `${result.tail || ''} with Root AI`
        : result.tail,
  };
}

/** Returns the labeled details to show when an action is expanded. */
export function getActionDetails(action: Action): ActionDetail[] {
  const metadata: Metadata = action.metadata || {};
  // There's no telling what's useful in a custom action's metadata, so all of
  // it is shown. For the CMS's own actions, ids and bookkeeping are left to
  // the full logs table.
  if (!getBuiltInPhrase(action)) {
    return Object.entries(metadata).map(([key, value]) => ({
      label: key,
      value: formatMetadataValue(value),
    }));
  }

  const details: ActionDetail[] = [];
  Object.entries(DETAIL_LABELS).forEach(([key, label]) => {
    const value = metadata[key];
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (Array.isArray(value) && value.length === 0) {
      return;
    }
    details.push({
      label,
      value: formatDetailValue(key, value),
      warning: key === 'overwritten',
    });
  });

  // The sentence can truncate before the end of a long change.
  if (action.action === 'tasks.update_metadata' && metadata.field) {
    const {field, from, to} = formatTaskMetadataChange(
      metadata as TaskMetadataChange
    );
    details.push({label: field, value: `${from} → ${to}`});
  }

  // The sentence can truncate before its " with Root AI" tail.
  if (metadata.source === 'root-ai') {
    details.push({label: 'Made with', value: 'Root AI'});
  }

  if (action.action === 'asset.sync_run') {
    const result = ['added', 'updated', 'unchanged', 'missing', 'failed']
      .filter((key) => metadata[key] > 0)
      .map((key) => `${metadata[key]} ${key}`);
    details.push({
      label: 'Result',
      value: result.length > 0 ? result.join(', ') : 'Up to date',
    });
  }
  return details;
}

function formatDetailValue(key: string, value: any) {
  if (DATE_DETAILS.includes(key)) {
    const millis = toTimestamp(value)?.toMillis();
    return millis ? formatLongDate(millis) : formatMetadataValue(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'On' : 'Off';
  }
  return formatMetadataValue(value);
}

/**
 * Returns what an action applied to. For asset library actions, this is the
 * asset's human-friendly file path rather than its id.
 */
export function getActionTarget(action: Action): string {
  const metadata = action.metadata || {};
  if (action.action.startsWith('asset.')) {
    const label = getAssetLabel(metadata);
    if (label) {
      return label;
    }
  }
  const id = getMetadataId(metadata);
  if (id && action.action.startsWith('tasks.')) {
    return `#${id}`;
  }
  return id;
}

/**
 * Returns a human-friendly label for an asset action. Older logs predate the
 * `path` metadata, so this falls back to the folder path or asset name.
 */
function getAssetLabel(metadata: Metadata): string {
  if (metadata.path) {
    return metadata.path;
  }
  if (metadata.folder) {
    return metadata.folder;
  }
  // Folder renames and moves log the folder's new path as `to`.
  if (!metadata.assetId && typeof metadata.to === 'string') {
    return metadata.to;
  }
  if (Array.isArray(metadata.folders)) {
    return formatMetadataValue(metadata.folders);
  }
  return metadata.name || '';
}

/**
 * Returns the id an action applied to: the first of `TARGET_ID_KEYS`, or else
 * any key ending in "id", which is what custom actions rely on. They can log
 * anything, so values that aren't text are skipped.
 */
function getMetadataId(metadata: Metadata): string {
  const keys = [...TARGET_ID_KEYS, ...Object.keys(metadata).sort()];
  for (const key of keys) {
    const value = metadata[key];
    const isId = key.toLowerCase().endsWith('id');
    if (isId && (typeof value === 'string' || typeof value === 'number')) {
      return String(value);
    }
  }
  return '';
}

/** Formats a metadata value for display. */
export function formatMetadataValue(value: any): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    if (value.length <= 3) {
      return value.join(', ');
    }
    return `${value.slice(0, 3).join(', ')} (+${value.length - 3} more)`;
  }
  if (typeof value === 'object') {
    const obj = cleanObject(value);
    try {
      return JSON.stringify(obj);
    } catch (e) {
      console.error(e);
      console.error('failed to stringify json:', obj);
    }
  }
  return String(value);
}

/**
 * Removes keys starting with `_` from the object. Without this for some reason
 * there are circular issues when trying to stringify to JSON.
 */
function cleanObject(obj: any) {
  const newObj: any = {};
  Object.entries(obj).forEach(([key, val]) => {
    if (!key.startsWith('_')) {
      newObj[key] = val;
    }
  });
  return newObj;
}

/**
 * Safely converts a timestamp value to a Firestore Timestamp. Handles
 * potentially corrupt or invalid timestamp values from the database.
 */
export function toTimestamp(ts: any): Timestamp | null {
  if (!ts) {
    return null;
  }
  // Already a valid Timestamp.
  if (ts instanceof Timestamp) {
    return ts;
  }
  // Firestore Timestamp-like object with _seconds.
  if (typeof ts === 'object' && typeof ts._seconds === 'number') {
    return new Timestamp(ts._seconds, ts._nanoseconds || 0);
  }
  // Firestore Timestamp-like object with seconds.
  if (typeof ts === 'object' && typeof ts.seconds === 'number') {
    return new Timestamp(ts.seconds, ts.nanoseconds || 0);
  }
  // Timestamp as milliseconds number.
  if (typeof ts === 'number') {
    return Timestamp.fromMillis(ts);
  }
  // Invalid timestamp format.
  return null;
}

/** Formats a time, e.g. "10:21 AM". */
export function formatTime(date: Date) {
  const hours24 = date.getHours();
  const ampm = hours24 < 12 ? 'AM' : 'PM';
  const hh = String(hours24 % 12 || 12).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${min} ${ampm}`;
}

/** Formats a timestamp as a long date, e.g. "June 12, 2026 10:21 AM". */
export function formatLongDate(millis: number) {
  const date = new Date(millis);
  const month = date.toLocaleDateString('en', {month: 'long'});
  const dd = String(date.getDate()).padStart(2, '0');
  return `${month} ${dd}, ${date.getFullYear()} ${formatTime(date)}`;
}
