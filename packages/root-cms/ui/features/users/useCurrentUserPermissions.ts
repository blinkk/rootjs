import {useMemo} from 'preact/hooks';
import {UserRole} from '../../../core/client.js';
import {
  getRole,
  testCanEdit,
  testCanPublish,
  testIsAdmin,
} from './permissions.js';
import {useProjectRoles} from './useProjectRoles.js';

/** Resolved project permissions for the currently signed-in CMS user. */
export interface CurrentUserPermissions {
  /** Signed-in user's email, or `''` if unavailable. */
  email: string;
  /** Resolved project role for the signed-in user, or `null` if unassigned. */
  role: UserRole | null;
  /** All project roles keyed by email or wildcard domain. */
  roles: Record<string, UserRole>;
  /** True while the project roles document is still loading. */
  loading: boolean;
  /** True if the user can edit drafts (ADMIN, EDITOR, or CONTRIBUTOR). */
  canEdit: boolean;
  /** True if the user can publish content (ADMIN or EDITOR). */
  canPublish: boolean;
  /** True if the user is a project ADMIN and roles have finished loading. */
  isAdmin: boolean;
}

/**
 * Returns the current signed-in user's project role and permission flags,
 * backed by the cached `useProjectRoles()` hook.
 */
export function useCurrentUserPermissions(): CurrentUserPermissions {
  const {roles, loading} = useProjectRoles();
  const email = window.firebase?.user?.email || '';

  return useMemo(() => {
    const role = getRole(roles, email);
    return {
      email,
      role,
      roles,
      loading: Boolean(loading),
      canEdit: testCanEdit(roles, email),
      canPublish: testCanPublish(roles, email),
      isAdmin: !loading && testIsAdmin(roles, email),
    };
  }, [roles, loading, email]);
}
