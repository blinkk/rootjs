import {describe, expect, it} from 'vitest';
import {getAvatarColor, getUserInitials} from './user-profile.js';

describe('getUserInitials', () => {
  it('uses the first letters of two display name words', () => {
    expect(getUserInitials('john.doe@example.com', 'John Doe')).toBe('JD');
  });

  it('uses the first two characters of a single-word display name', () => {
    expect(getUserInitials('san@example.com', 'Sandy')).toBe('SA');
  });

  it('falls back to the email local part when display name is missing', () => {
    expect(getUserInitials('alex@example.com')).toBe('AL');
  });

  it('strips non-alphanumeric characters from the local part', () => {
    expect(getUserInitials('john.doe@example.com')).toBe('JO');
  });

  it('returns a placeholder when no usable characters exist', () => {
    expect(getUserInitials('')).toBe('?');
    expect(getUserInitials('@@@@@')).toBe('?');
  });

  it('uppercases the result', () => {
    expect(getUserInitials('zoe@example.com')).toBe('ZO');
  });
});

describe('getAvatarColor', () => {
  it('returns the same color for the same email', () => {
    expect(getAvatarColor('a@b.com')).toBe(getAvatarColor('a@b.com'));
  });

  it('returns a hex color from the predefined palette', () => {
    expect(getAvatarColor('zoe@example.com')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
