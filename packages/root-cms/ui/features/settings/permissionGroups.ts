import {UserRole} from '../../../core/client.js';

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

/** The sharing settings an admin edits, as saved on the Project doc. */
export interface ShareDoc {
  globalRoles: Record<string, UserRole>;
  permissionGroups: PermissionGroup[];
}

/** Returns a group's name for a log message, as shown in the settings UI. */
function groupLabel(group: PermissionGroup): string {
  return `"${group.name || 'Untitled group'}"`;
}

function collectionsLabel(collections: string[]): string {
  return collections.length > 0 ? collections.join(', ') : 'all collections';
}

function groupSummary(group: PermissionGroup): string {
  const users = (group.users || []).filter(Boolean);
  const usersLabel =
    users.length > 0 ? `users: ${users.join(', ')}` : 'no users';
  const collections = (group.collections || []).filter(Boolean);
  return `${group.role} on ${collectionsLabel(collections)}, ${usersLabel}`;
}

function describeRoleChanges(
  before: Record<string, UserRole>,
  after: Record<string, UserRole>
): string[] {
  const changes: string[] = [];
  const emails = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const email of Array.from(emails).sort()) {
    const from = before[email];
    const to = after[email];
    if (!from) {
      changes.push(`Added ${email} as ${to}`);
    } else if (!to) {
      changes.push(`Removed ${email} (was ${from})`);
    } else if (from !== to) {
      changes.push(`Changed ${email} from ${from} to ${to}`);
    }
  }
  return changes;
}

function describeGroupChanges(
  before: PermissionGroup,
  after: PermissionGroup
): string[] {
  const changes: string[] = [];
  const label = groupLabel(after);
  if (groupLabel(before) !== label) {
    changes.push(`Renamed group ${groupLabel(before)} to ${label}`);
  }
  if (before.role !== after.role) {
    changes.push(
      `Changed group ${label} role from ${before.role} to ${after.role}`
    );
  }

  const fromCollections = (before.collections || []).filter(Boolean).sort();
  const toCollections = (after.collections || []).filter(Boolean).sort();
  if (fromCollections.join() !== toCollections.join()) {
    changes.push(
      `Changed group ${label} collections from ${collectionsLabel(
        fromCollections
      )} to ${collectionsLabel(toCollections)}`
    );
  }

  const fromUsers = (before.users || []).filter(Boolean);
  const toUsers = (after.users || []).filter(Boolean);
  const added = toUsers.filter((email) => !fromUsers.includes(email));
  const removed = fromUsers.filter((email) => !toUsers.includes(email));
  if (added.length > 0) {
    changes.push(`Added ${added.join(', ')} to group ${label}`);
  }
  if (removed.length > 0) {
    changes.push(`Removed ${removed.join(', ')} from group ${label}`);
  }
  return changes;
}

/**
 * Describes what changed between two versions of the sharing settings, one
 * sentence per change, e.g. `Added ada@example.com as EDITOR`. These are
 * stored on the action log entry so that the record of who had access doesn't
 * depend on the settings as they are today. Groups are matched by id, so a
 * renamed group reads as a rename rather than a delete and a create.
 */
export function describeShareChanges(
  before: ShareDoc,
  after: ShareDoc
): string[] {
  const changes = describeRoleChanges(before.globalRoles, after.globalRoles);
  const beforeGroups = new Map(before.permissionGroups.map((g) => [g.id, g]));
  const afterIds = new Set(after.permissionGroups.map((g) => g.id));

  for (const group of after.permissionGroups) {
    const previous = beforeGroups.get(group.id);
    if (previous) {
      changes.push(...describeGroupChanges(previous, group));
    } else {
      changes.push(
        `Created group ${groupLabel(group)} (${groupSummary(group)})`
      );
    }
  }
  for (const group of before.permissionGroups) {
    if (!afterIds.has(group.id)) {
      changes.push(
        `Deleted group ${groupLabel(group)} (${groupSummary(group)})`
      );
    }
  }
  return changes;
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
