import {useMemo} from 'preact/hooks';
import {UserRole} from '../../core/client.js';
import {UserProfile, isOrgEmail} from '../utils/user-profile.js';
import {useProjectRoles} from './useProjectRoles.js';
import {useAllUserProfiles} from './useUserProfile.js';

/** A user known to the current project, for autocomplete pickers. */
export interface ProjectUser {
  /** Lower-cased email address. */
  email: string;
  /** Display name from the user's profile, if they've signed in before. */
  displayName?: string;
  /** Profile photo URL, if available. */
  photoURL?: string;
  /** The user's role on the project, if they're listed in the roles map. */
  role?: UserRole;
}

export interface UseProjectUsersResult {
  users: ProjectUser[];
  loading: boolean;
}

/**
 * Returns the list of users associated with the current project, merging the
 * project's roles map with the saved user profiles (which supply display names
 * and avatars). Domain wildcards (e.g. `*@example.com`) are excluded since
 * they aren't addressable users.
 *
 * Both underlying sources are cached in memory, so mounting this hook on
 * several pages issues at most one fetch each.
 *
 * Example:
 *   const {users} = useProjectUsers();
 */
export function useProjectUsers(): UseProjectUsersResult {
  const {roles, loading: rolesLoading} = useProjectRoles();
  const {profiles, loading: profilesLoading} = useAllUserProfiles();

  const users = useMemo(() => {
    const byEmail = new Map<string, ProjectUser>();
    const add = (email: string, values: Partial<ProjectUser>) => {
      const key = email.trim().toLowerCase();
      if (!key || !key.includes('@') || isOrgEmail(key)) {
        return;
      }
      const existing = byEmail.get(key);
      byEmail.set(key, {...(existing || {email: key}), ...values, email: key});
    };
    Object.entries(roles).forEach(([email, role]) => add(email, {role}));
    profiles.forEach((profile: UserProfile) => {
      if (profile.email) {
        add(profile.email, {
          displayName: profile.displayName,
          photoURL: profile.photoURL,
        });
      }
    });
    return Array.from(byEmail.values()).sort((a, b) => {
      const aLabel = (a.displayName || a.email).toLowerCase();
      const bLabel = (b.displayName || b.email).toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [roles, profiles]);

  return {users, loading: rolesLoading || profilesLoading};
}
