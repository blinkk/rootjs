import {describe, it, expect} from 'vitest';
import {UserRole} from '../../core/client.js';
import {getRole, testCanPublish, testCanEdit} from './permissions.js';

describe('permissions', () => {
  const roles: Record<string, UserRole> = {
    'admin@example.com': 'ADMIN',
    'editor@example.com': 'EDITOR',
    'contributor@example.com': 'CONTRIBUTOR',
    'viewer@example.com': 'VIEWER',
    '*@rootjs.dev': 'ADMIN',
    'guest@rootjs.dev': 'VIEWER', // Override wildcard
  };

  describe('getRole', () => {
    it('returns role for direct email match', () => {
      expect(getRole(roles, 'admin@example.com')).toBe('ADMIN');
      expect(getRole(roles, 'editor@example.com')).toBe('EDITOR');
    });

    it('returns role for wildcard domain match', () => {
      expect(getRole(roles, 'foo@rootjs.dev')).toBe('ADMIN');
    });

    it('prefers direct match over wildcard', () => {
      expect(getRole(roles, 'guest@rootjs.dev')).toBe('VIEWER');
    });

    it('returns null if no match found', () => {
      expect(getRole(roles, 'stranger@other.com')).toBe(null);
    });
  });

  describe('testCanPublish', () => {
    it('returns true for ADMIN', () => {
      expect(testCanPublish(roles, 'admin@example.com')).toBe(true);
      expect(testCanPublish(roles, 'foo@rootjs.dev')).toBe(true);
    });

    it('returns true for EDITOR', () => {
      expect(testCanPublish(roles, 'editor@example.com')).toBe(true);
    });

    it('returns false for CONTRIBUTOR', () => {
      expect(testCanPublish(roles, 'contributor@example.com')).toBe(false);
    });

    it('returns false for VIEWER', () => {
      expect(testCanPublish(roles, 'viewer@example.com')).toBe(false);
    });

    it('returns false for unknown user', () => {
      expect(testCanPublish(roles, 'stranger@other.com')).toBe(false);
    });
  });

  describe('testCanEdit', () => {
    it('returns true for ADMIN', () => {
      expect(testCanEdit(roles, 'admin@example.com')).toBe(true);
    });

    it('returns true for EDITOR', () => {
      expect(testCanEdit(roles, 'editor@example.com')).toBe(true);
    });

    it('returns true for CONTRIBUTOR', () => {
      expect(testCanEdit(roles, 'contributor@example.com')).toBe(true);
    });

    it('returns false for VIEWER', () => {
      expect(testCanEdit(roles, 'viewer@example.com')).toBe(false);
    });

    it('returns false for unknown user', () => {
      expect(testCanEdit(roles, 'stranger@other.com')).toBe(false);
    });
  });
});
