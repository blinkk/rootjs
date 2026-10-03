// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {isPlaceholderFirebaseProject} from './plugin.js';

describe('isPlaceholderFirebaseProject', () => {
  it('detects the starter template placeholder', () => {
    expect(
      isPlaceholderFirebaseProject({projectId: 'YOUR_FIREBASE_PROJECT_ID'})
    ).toBe(true);
  });

  it('returns false for a real project', () => {
    expect(isPlaceholderFirebaseProject({projectId: 'my-project'})).toBe(false);
    expect(
      isPlaceholderFirebaseProject({
        apiKey: 'YOUR_FIREBASE_API_KEY',
        projectId: 'my-project',
      })
    ).toBe(false);
  });

  it('returns false when there is no project id', () => {
    expect(isPlaceholderFirebaseProject(undefined)).toBe(false);
    expect(isPlaceholderFirebaseProject({})).toBe(false);
  });
});
