import {UserRole} from '../../core/client.js';

/**
 * Returns the role for a specific user email.
 *
 * This function checks for a direct match first (e.g. "user@example.com").
 * If no direct match is found, it checks for a domain wildcard match
 * (e.g. "*@example.com").
 */
export function getRole(
  roles: Record<string, UserRole>,
  email: string
): UserRole | null {
  if (email in roles) {
    return roles[email];
  }
  const domain = email.split('@').at(-1);
  const domainEmail = `*@${domain}`;
  if (domainEmail in roles) {
    return roles[domainEmail];
  }
  return null;
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
