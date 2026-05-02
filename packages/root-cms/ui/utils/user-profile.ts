import {Timestamp, collection, doc, getDoc, getDocs} from 'firebase/firestore';

/**
 * Profile data for a CMS user, persisted to
 * `Projects/<projectId>/UserProfiles/<email>` whenever they sign in.
 */
export interface UserProfile {
  email: string;
  displayName?: string;
  photoURL?: string;
  uid?: string;
  lastSignedInAt?: Timestamp;
}

/** Time-to-live for cached profile entries. */
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  /** Cached profile, or `null` if no profile exists for the email. */
  value: UserProfile | null;
  /** When the entry was inserted. */
  fetchedAt: number;
}

const profileCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<UserProfile | null>>();
const subscribers = new Set<() => void>();

/** Lower-cases an email for use as a cache/db key. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getCachedEntry(email: string): CacheEntry | undefined {
  const entry = profileCache.get(email);
  if (!entry) {
    return undefined;
  }
  if (Date.now() - entry.fetchedAt > PROFILE_CACHE_TTL_MS) {
    profileCache.delete(email);
    return undefined;
  }
  return entry;
}

function notifySubscribers() {
  subscribers.forEach((cb) => cb());
}

function userProfilesCollectionRef() {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return collection(db, 'Projects', projectId, 'UserProfiles');
}

function userProfileDocRef(email: string) {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return doc(db, 'Projects', projectId, 'UserProfiles', email);
}

/**
 * Returns the cached profile for an email, or `undefined` if it has not yet
 * been fetched. Returns `null` if a fetch returned no profile.
 */
export function getCachedUserProfile(
  email: string
): UserProfile | null | undefined {
  if (!email) {
    return null;
  }
  const entry = getCachedEntry(normalizeEmail(email));
  return entry ? entry.value : undefined;
}

/**
 * Loads a single user profile from the DB, caching the result. Concurrent
 * lookups for the same email share an in-flight promise.
 */
export async function fetchUserProfile(
  email: string
): Promise<UserProfile | null> {
  if (!email) {
    return null;
  }
  const key = normalizeEmail(email);
  const cached = getCachedEntry(key);
  if (cached) {
    return cached.value;
  }
  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }
  const promise = (async () => {
    try {
      const snapshot = await getDoc(userProfileDocRef(key));
      const value = snapshot.exists() ? (snapshot.data() as UserProfile) : null;
      profileCache.set(key, {value, fetchedAt: Date.now()});
      notifySubscribers();
      return value;
    } catch (err) {
      console.error('failed to fetch user profile:', email, err);
      // Cache the negative result briefly to avoid hammering the DB.
      profileCache.set(key, {value: null, fetchedAt: Date.now()});
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/**
 * Loads multiple user profiles, returning a map keyed by lower-cased email.
 * Uses the in-memory cache to avoid duplicate fetches.
 */
export async function fetchUserProfiles(
  emails: string[]
): Promise<Map<string, UserProfile | null>> {
  const result = new Map<string, UserProfile | null>();
  await Promise.all(
    emails.map(async (email) => {
      const profile = await fetchUserProfile(email);
      result.set(normalizeEmail(email), profile);
    })
  );
  return result;
}

/**
 * Lists all user profiles for the current project. Results are merged into
 * the in-memory cache.
 */
export async function listUserProfiles(): Promise<UserProfile[]> {
  const snapshot = await getDocs(userProfilesCollectionRef());
  const profiles: UserProfile[] = [];
  snapshot.forEach((d) => {
    const data = d.data() as UserProfile;
    profiles.push(data);
    if (data.email) {
      profileCache.set(normalizeEmail(data.email), {
        value: data,
        fetchedAt: Date.now(),
      });
    }
  });
  notifySubscribers();
  return profiles;
}

/** Subscribes to cache updates. Returns an unsubscribe function. */
export function subscribeToUserProfileCache(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Clears all cached profiles. Primarily used in tests. */
export function clearUserProfileCache() {
  profileCache.clear();
  inflight.clear();
}

/** Returns the initials to display when no photoURL is available. */
export function getUserInitials(email: string, displayName?: string): string {
  const source = (displayName || email || '').trim();
  if (!source) {
    return '?';
  }
  // For display names, prefer first letters of the first two words.
  if (displayName) {
    const words = displayName
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    if (words.length === 1 && words[0].length > 0) {
      return words[0].slice(0, 2).toUpperCase();
    }
  }
  // Fall back to the alphanumeric prefix of the email's local part.
  const localPart = email.split('@')[0] || email;
  const alphanum = localPart.replace(/[^a-zA-Z0-9]/g, '');
  if (alphanum.length === 0) {
    return '?';
  }
  return alphanum.slice(0, 2).toUpperCase();
}

/**
 * Returns a deterministic background color for an email so missing-photo
 * avatars are visually distinct but stable across renders.
 */
export function getAvatarColor(email: string): string {
  const palette = [
    '#1f6feb',
    '#0e7490',
    '#0f766e',
    '#15803d',
    '#9333ea',
    '#c026d3',
    '#db2777',
    '#dc2626',
    '#ea580c',
    '#b45309',
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}
