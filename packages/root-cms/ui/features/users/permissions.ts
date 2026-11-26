import {UserRole} from '../../../core/client.js';

/**
 * Returns the role for a specific user email (case-insensitive).
 *
 * This function checks for a direct match first (e.g. "user@example.com").
 * If no direct match is found, it checks for a domain wildcard match
 * (e.g. "*@example.com").
 */
export function getRole(
  roles: Record<string, UserRole>,
  email: string
): UserRole | null {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }
  if (normalizedEmail in roles) {
    return roles[normalizedEmail];
  }
  if (email in roles) {
    return roles[email];
  }
  const domain = normalizedEmail.split('@').at(-1);
  const domainEmail = domain ? `*@${domain}` : '';

  // Fall back to a case-insensitive scan so mixed-case role keys also match,
  // still preferring a direct email match over a domain wildcard.
  let wildcardMatch: UserRole | null =
    domainEmail && domainEmail in roles ? roles[domainEmail] : null;
  for (const [key, role] of Object.entries(roles)) {
    const normalizedKey = key.trim().toLowerCase();
    if (normalizedKey === normalizedEmail) {
      return role;
    }
    if (domainEmail && !wildcardMatch && normalizedKey === domainEmail) {
      wildcardMatch = role;
    }
  }
  return wildcardMatch;
}

/**
 * Returns true if the user has permission to publish content.
 *
 * Users with ADMIN or EDITOR roles can publish.
 */
export function testCanPublish(
  roles: Record<string, UserRole>,
  email: string
): boolean {
  const role = getRole(roles, email);
  return role === 'ADMIN' || role === 'EDITOR';
}

/**
 * Returns true if the user is a project admin.
 *
 * Admins can skip publishing checks entirely and publish over failed
 * required checks.
 */
export function testIsAdmin(
  roles: Record<string, UserRole>,
  email: string
): boolean {
  return getRole(roles, email) === 'ADMIN';
}

/**
 * Returns true if the user has permission to edit content (save drafts).
 *
 * Users with ADMIN, EDITOR, or CONTRIBUTOR roles can edit.
 */
export function testCanEdit(
  roles: Record<string, UserRole>,
  email: string
): boolean {
  const role = getRole(roles, email);
  return role === 'ADMIN' || role === 'EDITOR' || role === 'CONTRIBUTOR';
}
