import {useEffect, useState} from 'preact/hooks';
import {
  UserProfile,
  fetchUserProfile,
  getCachedUserProfile,
  listUserProfiles,
  subscribeToUserProfileCache,
} from '../utils/user-profile.js';

export interface UseUserProfileResult {
  /** The loaded profile, or `null` if none exists. */
  profile: UserProfile | null;
  /** True while the initial fetch is in progress. */
  loading: boolean;
}

/**
 * Loads a user profile by email, returning a cached value when available. The
 * result updates automatically when the cache is populated by other consumers.
 */
export function useUserProfile(email?: string | null): UseUserProfileResult {
  const initial = email ? getCachedUserProfile(email) : null;
  const [profile, setProfile] = useState<UserProfile | null>(initial ?? null);
  const [loading, setLoading] = useState<boolean>(
    Boolean(email) && initial === undefined
  );

  useEffect(() => {
    if (!email) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cached = getCachedUserProfile(email);
    if (cached !== undefined) {
      setProfile(cached);
      setLoading(false);
    } else {
      setLoading(true);
      fetchUserProfile(email).then((value) => {
        if (cancelled) {
          return;
        }
        setProfile(value);
        setLoading(false);
      });
    }

    const unsubscribe = subscribeToUserProfileCache(() => {
      if (cancelled || !email) {
        return;
      }
      const next = getCachedUserProfile(email);
      if (next !== undefined) {
        setProfile(next);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [email]);

  return {profile, loading};
}

export interface UseUserProfilesResult {
  /** Loaded profiles keyed by lower-cased email. */
  profiles: Map<string, UserProfile | null>;
  loading: boolean;
}

/**
 * Loads profiles for a list of emails. Results are returned as a Map keyed by
 * lower-cased email so callers can render avatars in any order.
 */
export function useUserProfiles(
  emails: Array<string | null | undefined>
): UseUserProfilesResult {
  const filtered = emails
    .filter((e): e is string => Boolean(e))
    .map((e) => e.toLowerCase());
  // Keys joined as a stable dependency string so effects re-run when the set
  // of emails changes (regardless of array identity).
  const key = filtered.slice().sort().join(',');

  const [profiles, setProfiles] = useState<Map<string, UserProfile | null>>(
    () => {
      const map = new Map<string, UserProfile | null>();
      filtered.forEach((email) => {
        const cached = getCachedUserProfile(email);
        if (cached !== undefined) {
          map.set(email, cached);
        }
      });
      return map;
    }
  );
  const [loading, setLoading] = useState<boolean>(filtered.length > 0);

  useEffect(() => {
    if (filtered.length === 0) {
      setProfiles(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;

    function syncFromCache() {
      const next = new Map<string, UserProfile | null>();
      let pending = false;
      filtered.forEach((email) => {
        const cached = getCachedUserProfile(email);
        if (cached === undefined) {
          pending = true;
        } else {
          next.set(email, cached);
        }
      });
      setProfiles(next);
      setLoading(pending);
    }

    syncFromCache();

    // Trigger fetches for any uncached emails.
    Promise.all(
      filtered
        .filter((email) => getCachedUserProfile(email) === undefined)
        .map((email) => fetchUserProfile(email))
    ).then(() => {
      if (!cancelled) {
        syncFromCache();
      }
    });

    const unsubscribe = subscribeToUserProfileCache(() => {
      if (!cancelled) {
        syncFromCache();
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key]);

  return {profiles, loading};
}

export interface UseAllUserProfilesResult {
  profiles: UserProfile[];
  loading: boolean;
}

/**
 * Loads all user profiles in the project. Useful for autocomplete pickers
 * (e.g. @mentions). Results are cached after first load.
 */
export function useAllUserProfiles(): UseAllUserProfilesResult {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listUserProfiles()
      .then((all) => {
        if (cancelled) {
          return;
        }
        setProfiles(all);
        setLoading(false);
      })
      .catch((err) => {
        console.error('failed to list user profiles:', err);
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {profiles, loading};
}
