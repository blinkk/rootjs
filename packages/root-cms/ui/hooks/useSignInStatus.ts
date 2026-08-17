import {useEffect, useState} from 'preact/hooks';
import {SignInStatus, getSignInStatuses} from '../utils/users.js';

export interface UseSignInStatusesResult {
  /** Sign-in statuses keyed by lower-cased email. */
  statuses: Map<string, SignInStatus>;
  loading: boolean;
}

/**
 * Looks up whether a set of users have a Google sign-in link that an admin
 * could reset. Requires the ADMIN role, so callers should pass `enabled:
 * false` for everyone else. Errors are logged and leave the map empty, which
 * keeps the action hidden rather than offering something that would fail.
 */
export function useSignInStatuses(
  emails: string[],
  options?: {enabled?: boolean}
): UseSignInStatusesResult {
  const enabled = options?.enabled !== false;
  // Joined as a stable dependency string so the effect re-runs when the set of
  // emails changes, regardless of array identity.
  const key = emails.slice().sort().join(',');
  const [statuses, setStatuses] = useState<Map<string, SignInStatus>>(
    () => new Map()
  );
  const [loading, setLoading] = useState(enabled && emails.length > 0);

  useEffect(() => {
    if (!enabled || emails.length === 0) {
      setStatuses(new Map());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getSignInStatuses(emails)
      .then((result) => {
        if (!cancelled) {
          setStatuses(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('failed to fetch sign-in statuses:', err);
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  return {statuses, loading};
}
