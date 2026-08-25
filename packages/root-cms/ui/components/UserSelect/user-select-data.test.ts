import {describe, expect, it} from 'vitest';
import {ProjectUser} from '../../hooks/useProjectUsers.js';
import {
  buildUserSelectData,
  isEmailLike,
  matchesQuery,
  shouldCreateItem,
  toFreeValueItem,
  toProfile,
  toUserItem,
} from './user-select-data.js';

const USERS: ProjectUser[] = [
  {
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    photoURL: 'https://example.com/ada.png',
    role: 'ADMIN',
  },
  {email: 'grace@example.com', displayName: 'Grace Hopper'},
  {email: 'noname@example.com'},
];

describe('isEmailLike', () => {
  it('accepts email addresses', () => {
    expect(isEmailLike('ada@example.com')).toBe(true);
    expect(isEmailLike('  ada@example.com  ')).toBe(true);
    expect(isEmailLike('ada+tasks@example.co.uk')).toBe(true);
  });

  it('rejects values that are not addressable', () => {
    expect(isEmailLike('ada')).toBe(false);
    expect(isEmailLike('')).toBe(false);
    expect(isEmailLike('@example.com')).toBe(false);
    expect(isEmailLike('ada@')).toBe(false);
    expect(isEmailLike('ada lovelace@example.com')).toBe(false);
    // Domain wildcards are role entries, not people.
    expect(isEmailLike('*@example.com')).toBe(false);
  });
});

describe('toUserItem', () => {
  it('labels users by display name, falling back to the email', () => {
    expect(toUserItem(USERS[0])).toEqual({
      value: 'ada@example.com',
      label: 'Ada Lovelace',
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      photoURL: 'https://example.com/ada.png',
    });
    expect(toUserItem(USERS[2]).label).toBe('noname@example.com');
  });
});

describe('toFreeValueItem', () => {
  it('normalizes the email and flags it as a free value', () => {
    expect(toFreeValueItem('  Outside@Other.COM ')).toEqual({
      value: 'outside@other.com',
      label: 'outside@other.com',
      email: 'outside@other.com',
      freeValue: true,
    });
  });
});

describe('buildUserSelectData', () => {
  it('lists the project users', () => {
    const data = buildUserSelectData({users: USERS, created: [], selected: []});
    expect(data.map((item) => item.value)).toEqual([
      'ada@example.com',
      'grace@example.com',
      'noname@example.com',
    ]);
  });

  it('includes typed-in values and keeps unknown selections', () => {
    const data = buildUserSelectData({
      users: USERS,
      created: [toFreeValueItem('typed@other.com')],
      selected: ['ada@example.com', 'Legacy@Other.com'],
    });
    expect(data.map((item) => item.value)).toEqual([
      'ada@example.com',
      'grace@example.com',
      'noname@example.com',
      'typed@other.com',
      'legacy@other.com',
    ]);
    expect(
      data.find((item) => item.value === 'legacy@other.com')
    ).toMatchObject({label: 'legacy@other.com', freeValue: true});
  });

  it('does not duplicate a typed-in value that is a project user', () => {
    const data = buildUserSelectData({
      users: USERS,
      created: [toFreeValueItem('ada@example.com')],
      selected: ['ada@example.com'],
    });
    expect(
      data.filter((item) => item.value === 'ada@example.com')
    ).toHaveLength(1);
    expect(data[0].displayName).toBe('Ada Lovelace');
  });
});

describe('toProfile', () => {
  it('returns the profile for a project user', () => {
    expect(toProfile(toUserItem(USERS[0]))).toEqual({
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      photoURL: 'https://example.com/ada.png',
    });
  });

  it('returns null for free values so no profile lookup is attempted', () => {
    expect(toProfile(toFreeValueItem('outside@other.com'))).toBeNull();
  });
});

describe('matchesQuery', () => {
  const ada = toUserItem(USERS[0]);

  it('matches on display name and on email', () => {
    expect(matchesQuery('lovelace', ada)).toBe(true);
    expect(matchesQuery('ADA@EXAM', ada)).toBe(true);
    expect(matchesQuery('  ada  ', ada)).toBe(true);
    expect(matchesQuery('grace', ada)).toBe(false);
  });

  it('matches everything when the query is empty', () => {
    expect(matchesQuery('', ada)).toBe(true);
    expect(matchesQuery('   ', ada)).toBe(true);
  });
});

describe('shouldCreateItem', () => {
  const data = buildUserSelectData({users: USERS, created: [], selected: []});

  it('offers to add an email that is not a project user', () => {
    expect(shouldCreateItem('outside@other.com', data)).toBe(true);
  });

  it('does not offer to add a value that is not an email', () => {
    expect(shouldCreateItem('ada', data)).toBe(false);
    expect(shouldCreateItem('', data)).toBe(false);
  });

  it('does not offer to add an email already in the list', () => {
    expect(shouldCreateItem('ada@example.com', data)).toBe(false);
    expect(shouldCreateItem('  ADA@example.com ', data)).toBe(false);
  });
});
