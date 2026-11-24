import {useCallback, useEffect, useState} from 'preact/hooks';
import {FIRESTORE_RULES_VERSION} from '../../../shared/security-rules.js';
import {useSiteSettings} from '../../hooks/useSiteSettings.js';
import {testIsAdmin} from '../users/permissions.js';
import {useProjectRoles} from '../users/useProjectRoles.js';

/** Status returned by `GET /cms/api/security.rules_status`. */
export interface ClientSecurityRulesStatus {
  status: 'up_to_date' | 'outdated' | 'unavailable';
  deployedVersion: number | null;
  latestVersion: number;
  hasMarkers: boolean;
  canAutoMerge: boolean;
  gcpProjectId: string;
  databaseId: string;
  reason?: string;
}

/** Response from `POST /cms/api/security.rules_apply`. */
export interface ApplySecurityRulesResponse {
  success: boolean;
  data?: {
    version: number;
    previousVersion: number | null;
    preservedCustomRules: boolean;
    status: string;
  };
  error?: string;
  message?: string;
}

let cachedStatus: ClientSecurityRulesStatus | null = null;
let hasCheckedSession = false;
let manualRefreshOutdatedAtDocVersion: number | undefined | null = null;
let inFlightPromise: Promise<ClientSecurityRulesStatus | null> | null = null;
const listeners = new Set<(status: ClientSecurityRulesStatus | null) => void>();

function notifyListeners(next: ClientSecurityRulesStatus | null) {
  cachedStatus = next;
  hasCheckedSession = true;
  listeners.forEach((fn) => fn(next));
}

/** Fetches the live security rules status from the server (deduplicated). */
async function fetchSecurityRulesStatus(
  forceRefresh = false,
  currentDocVersion?: number
): Promise<ClientSecurityRulesStatus | null> {
  if (!forceRefresh && hasCheckedSession) {
    return cachedStatus;
  }
  if (!forceRefresh && inFlightPromise) {
    return inFlightPromise;
  }
  const url = forceRefresh
    ? '/cms/api/security.rules_status?refresh=1'
    : '/cms/api/security.rules_status';
  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        hasCheckedSession = true;
        return null;
      }
      const json = await res.json();
      if (!json?.success || !json?.data) {
        hasCheckedSession = true;
        return null;
      }
      if (forceRefresh) {
        manualRefreshOutdatedAtDocVersion =
          json.data.status !== 'up_to_date' ? currentDocVersion : null;
      }
      notifyListeners(json.data as ClientSecurityRulesStatus);
      return json.data as ClientSecurityRulesStatus;
    } catch {
      hasCheckedSession = true;
      return null;
    } finally {
      if (inFlightPromise === promise) {
        inFlightPromise = null;
      }
    }
  })();
  inFlightPromise = promise;
  return promise;
}

/**
 * Tracks whether the project's deployed Firestore security rules are up to
 * date. Only runs for ADMIN users. Uses `Projects/{projectId}.securityRulesVersion`
 * as a zero-overhead fast path so the server API is only called when the
 * stored version is missing or older than `FIRESTORE_RULES_VERSION`.
 */
export function useSecurityRulesStatus() {
  const {roles, loading: rolesLoading} = useProjectRoles();
  const {securityRulesVersion, loaded: siteLoaded} = useSiteSettings();
  const email = window.firebase?.user?.email || '';
  const isAdmin = !rolesLoading && testIsAdmin(roles, email);

  const storedFirestoreVersion = securityRulesVersion?.firestore;
  const isUpToDateFromDoc =
    typeof storedFirestoreVersion === 'number' &&
    storedFirestoreVersion >= FIRESTORE_RULES_VERSION;

  const [remoteStatus, setRemoteStatus] =
    useState<ClientSecurityRulesStatus | null>(cachedStatus);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const onUpdate = (next: ClientSecurityRulesStatus | null) => {
      setRemoteStatus(next);
    };
    listeners.add(onUpdate);
    return () => {
      listeners.delete(onUpdate);
    };
  }, []);

  const manualRefreshOverrodeDoc =
    manualRefreshOutdatedAtDocVersion !== null &&
    manualRefreshOutdatedAtDocVersion === storedFirestoreVersion;

  useEffect(() => {
    if (!isAdmin || !siteLoaded) {
      return;
    }
    if (isUpToDateFromDoc) {
      // If `Projects/{projectId}.securityRulesVersion` updated live (e.g. after
      // running `npx root-cms update-firebase-security-rules`), clear any stale
      // `outdated` status unless a manual Re-check just found a rollback.
      if (!manualRefreshOverrodeDoc && cachedStatus?.status === 'outdated') {
        notifyListeners(null);
      }
      return;
    }
    if (hasCheckedSession) {
      setRemoteStatus(cachedStatus);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchSecurityRulesStatus(false).finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, siteLoaded, isUpToDateFromDoc, manualRefreshOverrodeDoc]);

  const refresh = useCallback(async () => {
    if (!isAdmin) {
      return null;
    }
    setLoading(true);
    try {
      return await fetchSecurityRulesStatus(true, storedFirestoreVersion);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, storedFirestoreVersion]);

  const apply = useCallback(async (): Promise<ApplySecurityRulesResponse> => {
    setApplying(true);
    try {
      const res = await fetch('/cms/api/security.rules_apply', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: '{}',
      });
      const json: ApplySecurityRulesResponse = await res.json().catch(() => ({
        success: false,
        error: 'UNKNOWN',
        message: `HTTP ${res.status}`,
      }));
      if (json.success && json.data) {
        manualRefreshOutdatedAtDocVersion = null;
        const gcpProjectId =
          remoteStatus?.gcpProjectId ||
          window.__ROOT_CTX?.firebaseConfig?.projectId ||
          '';
        const databaseId =
          remoteStatus?.databaseId ||
          window.__ROOT_CTX?.firebaseConfig?.databaseId ||
          '(default)';
        notifyListeners({
          status: 'up_to_date',
          deployedVersion: json.data.version,
          latestVersion: FIRESTORE_RULES_VERSION,
          hasMarkers: true,
          canAutoMerge: true,
          gcpProjectId,
          databaseId,
        });
      }
      return json;
    } finally {
      setApplying(false);
    }
  }, [remoteStatus?.gcpProjectId, remoteStatus?.databaseId]);

  const gcpProjectId =
    remoteStatus?.gcpProjectId ||
    window.__ROOT_CTX?.firebaseConfig?.projectId ||
    '';
  const databaseId =
    remoteStatus?.databaseId ||
    window.__ROOT_CTX?.firebaseConfig?.databaseId ||
    '(default)';

  let status: ClientSecurityRulesStatus | null = remoteStatus;
  if (!isAdmin) {
    status = null;
  } else if (isUpToDateFromDoc && !manualRefreshOverrodeDoc) {
    status = {
      status: 'up_to_date',
      deployedVersion: storedFirestoreVersion!,
      latestVersion: FIRESTORE_RULES_VERSION,
      hasMarkers: true,
      canAutoMerge: true,
      gcpProjectId,
      databaseId,
    };
  }

  return {
    isAdmin,
    status,
    loading,
    applying,
    refresh,
    apply,
  };
}
