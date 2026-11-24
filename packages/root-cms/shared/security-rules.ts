/**
 * Current version of the Root.js CMS Firestore security rules. Increment this
 * whenever `FIRESTORE_RULES` changes so the CMS can notify admins to update
 * their deployed rules.
 */
export const FIRESTORE_RULES_VERSION = 2;

/**
 * Current version of the Root.js CMS Firebase Storage security rules.
 */
export const STORAGE_RULES_VERSION = 1;

/** Comment marker denoting the start of the Root.js CMS managed rules block. */
export const ROOT_CMS_RULES_START = '// [START root-cms]';

/** Comment marker denoting the end of the Root.js CMS managed rules block. */
export const ROOT_CMS_RULES_END = '// [END root-cms]';

/**
 * The Root.js CMS managed block inside `match /databases/{database}/documents`.
 * Custom project rules placed outside these markers are preserved when
 * updating the Root.js CMS rules.
 */
export const FIRESTORE_RULES_MANAGED_BLOCK = `    ${ROOT_CMS_RULES_START}
    // Managed by Root.js CMS. Do not edit between START and END comments;
    // add custom rules outside this block so they are preserved on updates.
    // root-cms-rules-version: ${FIRESTORE_RULES_VERSION}
    match /{document=**} {
      allow read, write: if false;
    }

    match /Projects/{project} {
      allow write:
        if isSignedIn() && userIsAdmin();
      allow read:
        if isSignedIn() && userCanRead();

      // Default for shared CMS collections (Published, Scheduled, Releases,
      // DataSources, Assets, Translations, etc.).
      match /{collection}/{document=**} {
        allow write:
          if isSignedIn() && userCanPublish();
        allow read:
          if isSignedIn() && userCanRead();
      }

      // Draft and collaborative collections (CONTRIBUTOR+).
      match /Collections/{collectionId}/Drafts/{document=**} {
        allow write:
          if isSignedIn() && userCanEdit();
      }

      match /TranslationsManager/draft/Translations/{document=**} {
        allow write:
          if isSignedIn() && userCanEdit();
      }

      match /Tasks/{document=**} {
        allow write:
          if isSignedIn() && userCanEdit();
      }

      match /Counters/tasks {
        allow write:
          if isSignedIn() && userCanEdit();
      }

      // Presence and per-user collections (all signed-in project members).
      match /Viewers/{viewerDoc} {
        allow write:
          if isSignedIn() && userCanRead();
      }

      match /UserProfiles/{email} {
        allow write:
          if isSignedIn() && userCanRead() && request.auth.token.email == email;
      }

      match /Users/{uid} {
        allow write:
          if isSignedIn() && userCanRead() && request.auth.uid == uid;
      }

      match /AiChats/{chatId} {
        allow create:
          if isSignedIn() && userCanRead() && request.resource.data.createdBy == request.auth.token.email;
        allow update:
          if isSignedIn() && userCanRead() && resource.data.createdBy == request.auth.token.email && request.resource.data.createdBy == request.auth.token.email;
        allow delete:
          if isSignedIn() && userCanRead() && resource.data.createdBy == request.auth.token.email;
      }

      function isSignedIn() {
        return request.auth != null && request.auth.token.email != null;
      }

      function getRoles() {
        return get(/databases/$(database)/documents/Projects/$(project)).data.roles;
      }

      function hasRole(allowed) {
        let roles = getRoles();
        let email = request.auth.token.email;
        let domain = '*@' + email.split('@')[1];
        return (roles[email] in allowed) || (roles[domain] in allowed);
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
 * Firebase Storage rules for CMS uploads. Files are stored under
 * `{siteId}/uploads/...` and anyone who can edit drafts on that site can
 * upload. Reading the site's roles from Firestore requires the Firebase
 * Storage service agent to have `roles/firebaserules.firestoreServiceAgent`.
 */
export const STORAGE_RULES = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    ${ROOT_CMS_RULES_START}
    // Managed by Root.js CMS. Do not edit between START and END comments;
    // add custom rules outside this block so they are preserved on updates.
    // root-cms-rules-version: ${STORAGE_RULES_VERSION}
    match /{allPaths=**} {
      allow read, write: if false;
    }

    match /{site}/uploads/{allPaths=**} {
      allow read;
      allow write:
        if request.auth != null && userCanEdit(site);
    }

    function userCanEdit(site) {
      let roles = firestore.get(/databases/(default)/documents/Projects/$(site)).data.roles;
      let email = request.auth.token.email;
      let domain = '*@' + email.split('@')[1];
      return (roles[email] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR']) || (roles[domain] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR']);
    }
    ${ROOT_CMS_RULES_END}
  }
}
`;

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

/** Result of merging the latest Root.js CMS Firestore rules into existing rules. */
export interface MergeFirestoreRulesResult {
  /**
   * - `created`: no existing rules; returning the full `FIRESTORE_RULES`.
   * - `merged`: replaced the `// [START root-cms]`..`// [END root-cms]` block.
   * - `upgraded`: existing rules were an unmodified legacy Root.js CMS ruleset.
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
  const match = source.match(/\/\/\s*root-cms-rules-version:\s*(\d+)/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Returns true if `source` contains a valid `// [START root-cms]` ...
 * `// [END root-cms]` marker pair.
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
 * preserving any custom rules outside `// [START root-cms]` ...
 * `// [END root-cms]`.
 */
export function mergeFirestoreRules(
  existingSource: string | null | undefined
): MergeFirestoreRulesResult {
  const previousVersion = parseRulesVersion(existingSource);
  if (!existingSource || !existingSource.trim()) {
    return {
      status: 'created',
      merged: FIRESTORE_RULES,
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
        'Existing Firestore rules contain multiple or mismatched ' +
        `${ROOT_CMS_RULES_START} / ${ROOT_CMS_RULES_END} markers. ` +
        'Ensure there is only one START/END block before updating.',
    };
  }

  const range = findMarkerRange(existingSource);
  if (range) {
    const before = existingSource.slice(0, range.start);
    const after = existingSource.slice(range.end);
    const merged = `${before}${FIRESTORE_RULES_MANAGED_BLOCK}${after}`;
    const preservedCustomRules =
      normalizeWhitespace(merged) !== normalizeWhitespace(FIRESTORE_RULES);
    return {
      status: 'merged',
      merged,
      previousVersion,
      preservedCustomRules,
    };
  }

  if (isLegacyRootCmsFirestoreRules(existingSource)) {
    return {
      status: 'upgraded',
      merged: FIRESTORE_RULES,
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
      'Existing Firestore rules contain custom rules without ' +
      `${ROOT_CMS_RULES_START} / ${ROOT_CMS_RULES_END} markers. ` +
      'Wrap the Root.js CMS section in those comments (or merge manually in ' +
      'the Firebase Console) so future updates preserve your custom rules.',
  };
}

/**
 * Returns true if `source` has more than one START/END marker or an unmatched
 * marker (e.g. START without END, END without START, or END before START).
 */
function hasAmbiguousMarkers(source: string): boolean {
  const startMatches = source.match(
    /^[ \t]*\/\/\s*\[START root-cms\][ \t]*$/gm
  );
  const endMatches = source.match(/^[ \t]*\/\/\s*\[END root-cms\][ \t]*$/gm);
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

/** Finds the line-aligned start/end offsets of the START/END marker block. */
function findMarkerRange(source: string): {start: number; end: number} | null {
  const startRegex = /^[ \t]*\/\/\s*\[START root-cms\][ \t]*$/m;
  const endRegex = /^[ \t]*\/\/\s*\[END root-cms\][ \t]*$/m;
  const startMatch = startRegex.exec(source);
  if (!startMatch) {
    return null;
  }
  const rest = source.slice(startMatch.index + startMatch[0].length);
  const endMatch = endRegex.exec(rest);
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

/**
 * Returns true if `source` appears to be an unmodified legacy (pre-marker)
 * Root.js CMS Firestore ruleset: inside `match /databases/{database}/documents`,
 * the only top-level `match` blocks are `/{document=**}` and `/Projects/{project}`
 * and there are no other sibling statements.
 */
function isLegacyRootCmsFirestoreRules(source: string): boolean {
  const stripped = stripComments(source).trim();
  const docMatch = /match\s+\/databases\/\{database\}\/documents\s*\{/.exec(
    stripped
  );
  if (!docMatch) {
    return false;
  }
  const bodyStart = docMatch.index + docMatch[0].length;
  const bodyEnd = findMatchingBrace(stripped, bodyStart - 1);
  if (bodyEnd === -1) {
    return false;
  }

  // Ensure nothing custom sits outside `match /databases/{database}/documents`.
  const outer = (
    stripped.slice(0, docMatch.index) + stripped.slice(bodyEnd + 1)
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (
    outer !== "rules_version = '2'; service cloud.firestore { }" &&
    outer !== 'rules_version = "2"; service cloud.firestore { }'
  ) {
    return false;
  }

  // Inspect top-level blocks inside `match /databases/{database}/documents`.
  const body = stripped.slice(bodyStart, bodyEnd);
  const topLevelPaths: string[] = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) {
      i++;
    }
    if (i >= body.length) {
      break;
    }
    const rest = body.slice(i);
    const m = /^match\s+(\S+)\s*\{/.exec(rest);
    if (!m) {
      // Unexpected top-level function or statement outside `match /Projects/{project}`.
      return false;
    }
    topLevelPaths.push(m[1]);
    const openBrace = i + m[0].length - 1;
    const closeBrace = findMatchingBrace(body, openBrace);
    if (closeBrace === -1) {
      return false;
    }
    i = closeBrace + 1;
  }

  const allowed = new Set(['/{document=**}', '/Projects/{project}']);
  return (
    topLevelPaths.includes('/Projects/{project}') &&
    topLevelPaths.every((p) => allowed.has(p))
  );
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

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    const prev = i > 0 ? source[i - 1] : '';
    if (inSingle) {
      if (ch === "'" && prev !== '\\') {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '"' && prev !== '\\') {
        inDouble = false;
      }
      continue;
    }
    if (ch === "'") {
      inSingle = true;
    } else if (ch === '"') {
      inDouble = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
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
