import {describe, it, expect} from 'vitest';
import {getPathStatus} from './utils.js';

describe('getPathStatus', () => {
  it('should return INCLUDE for exact match', () => {
    expect(getPathStatus('foo', ['foo'], [])).toBe('INCLUDE');
  });

  it('should return TRAVERSE for partial match', () => {
    expect(getPathStatus('foo', ['foo/bar'], [])).toBe('TRAVERSE');
  });

  it('should return SKIP for no match', () => {
    expect(getPathStatus('bar', ['foo'], [])).toBe('SKIP');
  });

  it('should return INCLUDE for glob match', () => {
    expect(getPathStatus('foo/bar', ['foo/**'], [])).toBe('INCLUDE');
    expect(getPathStatus('foo/bar/baz', ['foo/**'], [])).toBe('INCLUDE');
  });

  it('should return INCLUDE for single star glob', () => {
    expect(getPathStatus('foo/bar', ['foo/*'], [])).toBe('INCLUDE');
  });

  it('should return SKIP for single star glob mismatch', () => {
    expect(getPathStatus('foo/bar/baz', ['foo/*'], [])).toBe('SKIP');
  });

  it('should return EXCLUDE if excluded', () => {
    expect(getPathStatus('foo', ['foo'], ['foo'])).toBe('EXCLUDE');
  });

  it('should handle complex scenarios', () => {
    const includes = ['Collections/Pages/**'];
    const excludes = ['Collections/Pages/Draft/**'];

    expect(getPathStatus('Collections', includes, excludes)).toBe('TRAVERSE');
    expect(getPathStatus('Collections/Pages', includes, excludes)).toBe(
      'INCLUDE'
    );
    expect(
      getPathStatus('Collections/Pages/Published', includes, excludes)
    ).toBe('INCLUDE');
    expect(getPathStatus('Collections/Pages/Draft', includes, excludes)).toBe(
      'EXCLUDE'
    );
  });
});
