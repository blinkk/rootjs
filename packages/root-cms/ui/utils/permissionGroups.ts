import {UserRole} from '../../core/client.js';

export interface PermissionGroup {
  id: string;
  name: string;
  role: UserRole;
  collections: string[];
  users: string[];
}

const ROLE_RANK: Record<UserRole, number> = {
  ADMIN: 4,
  EDITOR: 3,
  CONTRIBUTOR: 2,
  VIEWER: 1,
};

export function roleRank(role: UserRole): number {
  return ROLE_RANK[role] ?? 0;
}

export function higherRole(a: UserRole, b: UserRole): UserRole {
  return roleRank(a) >= roleRank(b) ? a : b;
}

function setMax(
  map: Record<string, UserRole>,
  email: string,
  role: UserRole
): void {
  const existing = map[email];
  map[email] = existing ? higherRole(existing, role) : role;
}

export interface DerivedRoles {
  projectRoles: Record<string, UserRole>;
  collectionRoles: Record<string, Record<string, UserRole>>;
}

/**
 * Computes the project-level and per-collection role maps from a set of
 * permission groups, merged on top of any direct user assignments.
 *
 * Rules:
 * - Groups with no `collections` apply project-wide.
 * - Groups with `collections` apply to those collection ids only, and any
 *   user appearing in them is bumped to at least VIEWER at the project level
 *   so they can sign in and read project-scoped data.
 * - When the same user appears in multiple groups (or a direct assignment),
 *   the higher role wins.
 */
export function derivedRolesFromGroups(
  groups: PermissionGroup[],
  directRoles: Record<string, UserRole> = {}
): DerivedRoles {
  const projectRoles: Record<string, UserRole> = {...directRoles};
  const collectionRoles: Record<string, Record<string, UserRole>> = {};

  for (const group of groups) {
    const users = (group.users || []).filter(Boolean);
    if (users.length === 0) {
      continue;
    }
    const collections = (group.collections || []).filter(Boolean);
    if (collections.length === 0) {
      for (const email of users) {
        setMax(projectRoles, email, group.role);
      }
    } else {
      for (const email of users) {
        setMax(projectRoles, email, 'VIEWER');
      }
      for (const collectionId of collections) {
        if (!collectionRoles[collectionId]) {
          collectionRoles[collectionId] = {};
        }
        for (const email of users) {
          setMax(collectionRoles[collectionId], email, group.role);
        }
      }
    }
  }

  return {projectRoles, collectionRoles};
}

export function newPermissionGroup(
  partial: Partial<PermissionGroup> = {}
): PermissionGroup {
  return {
    id:
      partial.id ||
      `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: partial.name || '',
    role: partial.role || 'VIEWER',
    collections: partial.collections ? [...partial.collections] : [],
    users: partial.users ? [...partial.users] : [],
  };
}
