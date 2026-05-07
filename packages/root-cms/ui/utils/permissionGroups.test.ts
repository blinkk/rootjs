import {describe, it, expect} from 'vitest';
import {
  PermissionGroup,
  derivedRolesFromGroups,
  higherRole,
  newPermissionGroup,
  roleRank,
} from './permissionGroups.js';

function group(partial: Partial<PermissionGroup>): PermissionGroup {
  return newPermissionGroup(partial);
}

describe('permissionGroups', () => {
  describe('roleRank / higherRole', () => {
    it('ranks roles ADMIN > EDITOR > CONTRIBUTOR > VIEWER', () => {
      expect(roleRank('ADMIN')).toBeGreaterThan(roleRank('EDITOR'));
      expect(roleRank('EDITOR')).toBeGreaterThan(roleRank('CONTRIBUTOR'));
      expect(roleRank('CONTRIBUTOR')).toBeGreaterThan(roleRank('VIEWER'));
    });

    it('higherRole returns the higher of two roles', () => {
      expect(higherRole('VIEWER', 'EDITOR')).toBe('EDITOR');
      expect(higherRole('ADMIN', 'EDITOR')).toBe('ADMIN');
      expect(higherRole('CONTRIBUTOR', 'CONTRIBUTOR')).toBe('CONTRIBUTOR');
    });
  });

  describe('derivedRolesFromGroups', () => {
    it('applies project-wide groups to project roles', () => {
      const groups = [
        group({role: 'EDITOR', collections: [], users: ['alice@example.com']}),
      ];
      const {projectRoles, collectionRoles} = derivedRolesFromGroups(groups);
      expect(projectRoles).toEqual({'alice@example.com': 'EDITOR'});
      expect(collectionRoles).toEqual({});
    });

    it('applies collection-scoped groups to collection roles + VIEWER project baseline', () => {
      const groups = [
        group({
          role: 'EDITOR',
          collections: ['BlogPosts'],
          users: ['alice@example.com'],
        }),
      ];
      const {projectRoles, collectionRoles} = derivedRolesFromGroups(groups);
      expect(projectRoles).toEqual({'alice@example.com': 'VIEWER'});
      expect(collectionRoles).toEqual({
        BlogPosts: {'alice@example.com': 'EDITOR'},
      });
    });

    it('higher role wins when user appears in multiple project groups', () => {
      const groups = [
        group({role: 'VIEWER', users: ['alice@example.com']}),
        group({role: 'ADMIN', users: ['alice@example.com']}),
      ];
      const {projectRoles} = derivedRolesFromGroups(groups);
      expect(projectRoles['alice@example.com']).toBe('ADMIN');
    });

    it('higher role wins between collection groups and project groups', () => {
      const groups = [
        group({
          role: 'EDITOR',
          collections: ['BlogPosts'],
          users: ['alice@example.com'],
        }),
        group({role: 'ADMIN', users: ['alice@example.com']}),
      ];
      const {projectRoles, collectionRoles} = derivedRolesFromGroups(groups);
      expect(projectRoles['alice@example.com']).toBe('ADMIN');
      expect(collectionRoles.BlogPosts['alice@example.com']).toBe('EDITOR');
    });

    it('respects direct role assignments and merges with groups (higher wins)', () => {
      const groups = [group({role: 'EDITOR', users: ['alice@example.com']})];
      const direct = {
        'alice@example.com': 'VIEWER' as const,
        '*@example.com': 'CONTRIBUTOR' as const,
      };
      const {projectRoles} = derivedRolesFromGroups(groups, direct);
      expect(projectRoles['alice@example.com']).toBe('EDITOR');
      expect(projectRoles['*@example.com']).toBe('CONTRIBUTOR');
    });

    it('direct ADMIN beats group EDITOR', () => {
      const groups = [group({role: 'EDITOR', users: ['alice@example.com']})];
      const direct = {'alice@example.com': 'ADMIN' as const};
      const {projectRoles} = derivedRolesFromGroups(groups, direct);
      expect(projectRoles['alice@example.com']).toBe('ADMIN');
    });

    it('spans multiple collections correctly', () => {
      const groups = [
        group({
          role: 'CONTRIBUTOR',
          collections: ['BlogPosts', 'Pages'],
          users: ['alice@example.com', 'bob@example.com'],
        }),
      ];
      const {projectRoles, collectionRoles} = derivedRolesFromGroups(groups);
      expect(projectRoles).toEqual({
        'alice@example.com': 'VIEWER',
        'bob@example.com': 'VIEWER',
      });
      expect(collectionRoles.BlogPosts).toEqual({
        'alice@example.com': 'CONTRIBUTOR',
        'bob@example.com': 'CONTRIBUTOR',
      });
      expect(collectionRoles.Pages).toEqual({
        'alice@example.com': 'CONTRIBUTOR',
        'bob@example.com': 'CONTRIBUTOR',
      });
    });

    it('skips groups with no users', () => {
      const groups = [
        group({role: 'ADMIN', users: []}),
        group({role: 'EDITOR', users: ['alice@example.com']}),
      ];
      const {projectRoles} = derivedRolesFromGroups(groups);
      expect(projectRoles).toEqual({'alice@example.com': 'EDITOR'});
    });
  });

  describe('newPermissionGroup', () => {
    it('creates a group with sensible defaults', () => {
      const g = newPermissionGroup();
      expect(g.name).toBe('');
      expect(g.role).toBe('VIEWER');
      expect(g.collections).toEqual([]);
      expect(g.users).toEqual([]);
      expect(g.id).toMatch(/^g_/);
    });

    it('respects overrides', () => {
      const g = newPermissionGroup({
        id: 'custom',
        name: 'Blog Editors',
        role: 'EDITOR',
        collections: ['BlogPosts'],
        users: ['a@example.com'],
      });
      expect(g.id).toBe('custom');
      expect(g.name).toBe('Blog Editors');
      expect(g.role).toBe('EDITOR');
      expect(g.collections).toEqual(['BlogPosts']);
      expect(g.users).toEqual(['a@example.com']);
    });
  });
});
