import {hashStr} from './strings.js';

/**
 * Current version of the Root.js CMS Firestore security rules. Increment this
 * whenever `FIRESTORE_RULES` changes so the CMS can notify admins to update
 * their deployed rules.
 */
export const FIRESTORE_RULES_VERSION = 2;

/**
 * Current version of the Root.js CMS Firebase Storage security rules. Increment
 * this whenever the permissions in `getStorageRules()` change. The version is
 * recorded in the rules' BEGIN marker and stamped on the project doc by the
 * CLI; the CMS UI does not check it yet.
 */
export const STORAGE_RULES_VERSION = 1;

/** Comment marker denoting the start of the Root.js CMS managed rules block. */
export const ROOT_CMS_RULES_START = `// === BEGIN ROOT CMS MANAGED RULES (version: ${FIRESTORE_RULES_VERSION}) — DO NOT EDIT ===`;

/** BEGIN marker for the Root.js CMS managed block in the Storage rules. */
export const ROOT_CMS_STORAGE_RULES_START = `// === BEGIN ROOT CMS MANAGED RULES (version: ${STORAGE_RULES_VERSION}) — DO NOT EDIT ===`;

/** Comment marker denoting the end of the Root.js CMS managed rules block. */
export const ROOT_CMS_RULES_END = '// === END ROOT CMS MANAGED RULES ===';

/**
 * The Root.js CMS managed block inside `match /databases/{database}/documents`.
 * Custom project rules placed outside these markers are preserved when
 * updating the Root.js CMS rules.
 */
export const FIRESTORE_RULES_MANAGED_BLOCK = `    ${ROOT_CMS_RULES_START}
    match /{document=**} {
      allow read, write: if false;
    }

    match /Projects/{project} {
      allow read: if isSignedIn() && userCanRead();
      allow write: if isSignedIn() && userIsAdmin();

      // Default for shared CMS collections (Published, Scheduled, Releases,
      // DataSources, Assets, Translations, etc.).
      match /{collection}/{document=**} {
        allow read: if isSignedIn() && userCanRead();
        allow write: if isSignedIn() && userCanPublish();
      }

      // Draft and collaborative collections (CONTRIBUTOR+).
      match /Collections/{collectionId}/Drafts/{document=**} {
        allow write: if isSignedIn() && userCanEdit();
      }
      match /TranslationsManager/draft/Translations/{document=**} {
        allow write: if isSignedIn() && userCanEdit();
      }
      match /Tasks/{document=**} {
        allow write: if isSignedIn() && userCanEdit();
      }
      match /Counters/tasks {
        allow create, update: if isSignedIn() && userCanEdit();
      }

      // Presence and per-user collections (all signed-in project members).
      match /Viewers/{viewerDoc} {
        allow write: if isSignedIn() && userCanRead();
      }
      match /UserProfiles/{email} {
        allow create, update:
          if isSignedIn() && userCanRead() && request.auth.token.email == email;
      }
      match /Users/{uid} {
        allow create, update:
          if isSignedIn() && userCanRead() && request.auth.uid == uid;
      }
      match /AiChats/{chatId} {
        allow create:
          if isSignedIn() && userCanRead()
          && request.resource.data.createdBy == request.auth.token.email;
        allow update:
          if isSignedIn() && userCanRead()
          && resource.data.createdBy == request.auth.token.email
          && request.resource.data.createdBy == request.auth.token.email;
        allow delete:
          if isSignedIn() && userCanRead()
          && resource.data.createdBy == request.auth.token.email;
      }

      // Role helpers.
      function isSignedIn() {
        return request.auth != null && request.auth.token.email != null;
      }
      function getRoles() {
        return get(/databases/$(database)/documents/Projects/$(project)).data.get('roles', {});
      }
      function hasRole(allowed) {
        let roles = getRoles();
        let email = request.auth.token.email;
        let domain = '*@' + email.split('@')[1];
        return (roles.get(email, '') in allowed) || (roles.get(domain, '') in allowed);
      }
      function userCanRead() {
        return hasRole(['ADMIN', 'EDITOR', 'CONTRIBUTOR', 'VIEWER']);
      }
      function userCanEdit() {
        return hasRole(['ADMIN', 'EDITOR', 'CONTRIBUTOR']);
      }
      function userCanPublish() {
        return hasRole(['ADMIN', 'EDITOR']);
      }
      function userIsAdmin() {
        return hasRole(['ADMIN']);
      }
    }
    ${ROOT_CMS_RULES_END}`;

/** Full Firestore security rules file for Root.js CMS. */
export const FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
${FIRESTORE_RULES_MANAGED_BLOCK}
  }
}
`;

/**
 * Returns the Root.js CMS managed block inside `match /b/{bucket}/o` of the
 * Firebase Storage rules. Site roles are read from the Firestore database
 * `databaseId` (defaults to `'(default)'`).
 */
export function getStorageRulesManagedBlock(
  databaseId?: string | null
): string {
  const id = normalizeFirestoreDatabaseId(databaseId);
  // The id is interpolated into the rules source, so only allow the characters
  // Firestore permits in a database id.
  if (id !== '(default)' && !/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(id)) {
    throw new Error(`invalid Firestore database id: ${id}`);
  }
  return `    ${ROOT_CMS_STORAGE_RULES_START}
    match /{allPaths=**} {
      allow read, write: if false;
    }

    match /{site}/uploads/{allPaths=**} {
      allow read;
      allow write:
        if request.auth != null && userCanEdit(site);
    }

    function userCanEdit(site) {
      let roles = firestore.get(/databases/${id}/documents/Projects/$(site)).data.roles;
      let email = request.auth.token.email;
      let domain = '*@' + email.split('@')[1];
      return (roles[email] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR']) || (roles[domain] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR']);
    }
    ${ROOT_CMS_RULES_END}`;
}

/**
 * Returns the full Firebase Storage rules file for CMS uploads. Files are
 * stored under `{siteId}/uploads/...` and anyone who can edit drafts on that
 * site can upload. Site roles are read from the Firestore database
 * `databaseId` (defaults to `'(default)'`), which requires the Firebase
 * Storage service agent to have `roles/firebaserules.firestoreServiceAgent`.
 */
export function getStorageRules(databaseId?: string | null): string {
  return `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
${getStorageRulesManagedBlock(databaseId)}
  }
}
`;
}

/** Firebase Storage rules for projects using the `(default)` database. */
export const STORAGE_RULES = getStorageRules();

/**
 * Stored on `Projects/{projectId}.securityRulesVersion` so the CMS can verify
 * whether the deployed rules are current without calling the Firebase Rules
 * API on every load.
 */
export interface SecurityRulesVersionDoc {
  /** Deployed Root.js CMS Firestore rules version. */
  firestore?: number;
  /** Deployed Root.js CMS Storage rules version. */
  storage?: number;
}

/** Result of merging the latest Root.js CMS rules into existing rules. */
export interface MergeRulesResult {
  /**
   * - `created`: no existing rules; returning the full Root.js CMS rules.
   * - `merged`: replaced the block between the BEGIN/END markers.
   * - `upgraded`: existing rules exactly matched a ruleset shipped by an
   *   earlier Root.js CMS version, from before the markers existed.
   * - `needs_manual_merge`: existing rules contain custom rules without markers.
   */
  status: 'created' | 'merged' | 'upgraded' | 'needs_manual_merge';
  /** The merged rules source, or `null` when `status === 'needs_manual_merge'`. */
  merged: string | null;
  /** Version parsed from the existing rules, or `null` if unversioned. */
  previousVersion: number | null;
  /** True when custom rules outside the managed block were preserved. */
  preservedCustomRules: boolean;
  /** Explanation when `status === 'needs_manual_merge'`. */
  reason?: string;
}

/** Result of `mergeFirestoreRules()`. */
export type MergeFirestoreRulesResult = MergeRulesResult;

/**
 * Extracts the Root.js CMS rules version from a Firestore or Storage rules
 * source string, or returns `null` if no version comment is present.
 */
export function parseRulesVersion(
  source: string | null | undefined
): number | null {
  if (!source) {
    return null;
  }
  const match =
    source.match(
      /BEGIN ROOT CMS MANAGED RULES\s*\(\s*version:\s*(\d+)\s*\)/i
    ) || source.match(/\/\/\s*root-cms-rules-version:\s*(\d+)/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Returns true if `source` contains a Root.js CMS BEGIN/END marker pair (see
 * `ROOT_CMS_RULES_START` and `ROOT_CMS_RULES_END`).
 */
export function hasRootCmsRulesMarkers(
  source: string | null | undefined
): boolean {
  if (!source) {
    return false;
  }
  const range = findMarkerRange(source);
  return range !== null;
}

/**
 * Merges the latest Root.js CMS Firestore security rules into `existingSource`,
 * preserving any custom rules outside the BEGIN/END markers.
 */
export function mergeFirestoreRules(
  existingSource: string | null | undefined
): MergeFirestoreRulesResult {
  return mergeManagedRules(existingSource, {
    label: 'Firestore',
    fullSource: FIRESTORE_RULES,
    managedBlock: FIRESTORE_RULES_MANAGED_BLOCK,
    legacyHashes: LEGACY_FIRESTORE_RULES_HASHES,
  });
}

/**
 * Merges the latest Root.js CMS Storage security rules into `existingSource`,
 * preserving any custom rules outside the BEGIN/END markers. Site roles are
 * read from the Firestore database `options.databaseId`.
 */
export function mergeStorageRules(
  existingSource: string | null | undefined,
  options?: {databaseId?: string | null}
): MergeRulesResult {
  return mergeManagedRules(existingSource, {
    label: 'Storage',
    fullSource: getStorageRules(options?.databaseId),
    managedBlock: getStorageRulesManagedBlock(options?.databaseId),
    legacyHashes: LEGACY_STORAGE_RULES_HASHES,
  });
}

/**
 * Fingerprints (see `fingerprintRules()`) of every Firestore ruleset shipped
 * by Root.js CMS before the BEGIN/END markers existed. Only an exact match is
 * safe to replace wholesale; anything else may hold custom rules.
 */
const LEGACY_FIRESTORE_RULES_HASHES = new Set([
  // 2023-03 (#95): per-project and per-collection role maps.
  '844a3255ddd0f',
  // 2024-03 (#276): ADMIN, EDITOR and VIEWER roles.
  '1958ceece34ee',
  // 2026-01 (#887) through v4.4.1: adds the CONTRIBUTOR role.
  '6e8ab4087efb5',
]);

/** Like `LEGACY_FIRESTORE_RULES_HASHES`, for the Storage rules. */
const LEGACY_STORAGE_RULES_HASHES = new Set([
  // 2026-09 (#1462) through v4.4.1.
  '4ae05b2b2bedd',
]);

/**
 * Returns a fingerprint of a rules source that ignores comments and
 * whitespace differences.
 */
function fingerprintRules(source: string): string {
  return hashStr(normalizeWhitespace(stripComments(source)) || ' ');
}

function mergeManagedRules(
  existingSource: string | null | undefined,
  options: {
    label: string;
    fullSource: string;
    managedBlock: string;
    legacyHashes: Set<string>;
  }
): MergeRulesResult {
  const {label, fullSource, managedBlock} = options;
  const previousVersion = parseRulesVersion(existingSource);
  if (!existingSource || !existingSource.trim()) {
    return {
      status: 'created',
      merged: fullSource,
      previousVersion: null,
      preservedCustomRules: false,
    };
  }

  if (hasAmbiguousMarkers(existingSource)) {
    return {
      status: 'needs_manual_merge',
      merged: null,
      previousVersion,
      preservedCustomRules: false,
      reason:
        `Existing ${label} rules contain multiple or mismatched ` +
        `${MARKERS_LABEL} markers. ` +
        'Ensure there is only one BEGIN/END block before updating.',
    };
  }

  const range = findMarkerRange(existingSource);
  if (range) {
    const before = existingSource.slice(0, range.start);
    const after = existingSource.slice(range.end);
    const merged = `${before}${managedBlock}${after}`;
    const preservedCustomRules =
      normalizeWhitespace(merged) !== normalizeWhitespace(fullSource);
    return {
      status: 'merged',
      merged,
      previousVersion,
      preservedCustomRules,
    };
  }

  if (options.legacyHashes.has(fingerprintRules(existingSource))) {
    return {
      status: 'upgraded',
      merged: fullSource,
      previousVersion,
      preservedCustomRules: false,
    };
  }

  return {
    status: 'needs_manual_merge',
    merged: null,
    previousVersion,
    preservedCustomRules: false,
    reason:
      `Existing ${label} rules contain custom rules without ` +
      `${MARKERS_LABEL} markers. ` +
      'Wrap the Root.js CMS section in those comments (or merge manually in ' +
      'the Firebase Console) so future updates preserve your custom rules.',
  };
}

/** Version-less marker names used in user-facing messages. */
const MARKERS_LABEL =
  '"// === BEGIN ROOT CMS MANAGED RULES (version: N) — DO NOT EDIT ===" / ' +
  `"${ROOT_CMS_RULES_END}"`;

const BEGIN_MARKER_GLOBAL_RE =
  /^[ \t]*\/\/\s*(?:===\s*BEGIN ROOT CMS MANAGED RULES\b[^\n]*|\[START root-cms\])[ \t]*$/gm;
const END_MARKER_GLOBAL_RE =
  /^[ \t]*\/\/\s*(?:===\s*END ROOT CMS MANAGED RULES\s*===|\[END root-cms\])[ \t]*$/gm;
const BEGIN_MARKER_RE =
  /^[ \t]*\/\/\s*(?:===\s*BEGIN ROOT CMS MANAGED RULES\b[^\n]*|\[START root-cms\])[ \t]*$/m;
const END_MARKER_RE =
  /^[ \t]*\/\/\s*(?:===\s*END ROOT CMS MANAGED RULES\s*===|\[END root-cms\])[ \t]*$/m;

/**
 * Returns true if `source` has more than one BEGIN/END marker or an unmatched
 * marker (e.g. BEGIN without END, END without BEGIN, or END before BEGIN).
 */
function hasAmbiguousMarkers(source: string): boolean {
  const startMatches = source.match(BEGIN_MARKER_GLOBAL_RE);
  const endMatches = source.match(END_MARKER_GLOBAL_RE);
  const startCount = startMatches ? startMatches.length : 0;
  const endCount = endMatches ? endMatches.length : 0;
  if (startCount === 0 && endCount === 0) {
    return false;
  }
  if (startCount !== 1 || endCount !== 1) {
    return true;
  }
  return findMarkerRange(source) === null;
}

/** Finds the line-aligned start/end offsets of the BEGIN/END marker block. */
function findMarkerRange(source: string): {start: number; end: number} | null {
  const startMatch = BEGIN_MARKER_RE.exec(source);
  if (!startMatch) {
    return null;
  }
  const rest = source.slice(startMatch.index + startMatch[0].length);
  const endMatch = END_MARKER_RE.exec(rest);
  if (!endMatch) {
    return null;
  }
  return {
    start: startMatch.index,
    end:
      startMatch.index +
      startMatch[0].length +
      endMatch.index +
      endMatch[0].length,
  };
}

/** Strips `//` and `/* ... * /` comments while preserving string literals. */
function stripComments(source: string): string {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = i + 1 < source.length ? source[i + 1] : '';
    const prev = i > 0 ? source[i - 1] : '';
    if (inSingle) {
      out += ch;
      if (ch === "'" && prev !== '\\') {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      out += ch;
      if (ch === '"' && prev !== '\\') {
        inDouble = false;
      }
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      out += ch;
    } else if (ch === '"') {
      inDouble = true;
      out += ch;
    } else if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        i++;
      }
      if (i < source.length && source[i] === '\n') {
        out += '\n';
      }
    } else if (ch === '/' && next === '*') {
      i += 2;
      while (
        i < source.length &&
        !(source[i] === '*' && source[i + 1] === '/')
      ) {
        i++;
      }
      i++;
    } else {
      out += ch;
    }
  }
  return out;
}

function normalizeWhitespace(source: string): string {
  return source.replace(/\s+/g, ' ').trim();
}

/** Normalizes a Firestore database ID, defaulting empty values to `'(default)'`. */
export function normalizeFirestoreDatabaseId(
  databaseId?: string | null
): string {
  const trimmed = databaseId?.trim();
  return trimmed ? trimmed : '(default)';
}

/**
 * Returns the Firebase Security Rules release ID for a Firestore database:
 * `'cloud.firestore'` for `'(default)'`, or `'cloud.firestore/<databaseId>'`
 * for a named database.
 */
export function getFirestoreRulesReleaseId(databaseId?: string | null): string {
  const id = normalizeFirestoreDatabaseId(databaseId);
  return id === '(default)' ? 'cloud.firestore' : `cloud.firestore/${id}`;
}

/**
 * Returns the Firebase Console Firestore Security Rules URL for the given
 * project and database ID (`-default-` in the URL path for `'(default)'`).
 */
export function getFirestoreConsoleRulesUrl(
  gcpProjectId: string,
  databaseId?: string | null
): string {
  const id = normalizeFirestoreDatabaseId(databaseId);
  const dbSegment = id === '(default)' ? '-default-' : encodeURIComponent(id);
  return `https://console.firebase.google.com/project/${encodeURIComponent(gcpProjectId)}/firestore/databases/${dbSegment}/security/rules`;
}
