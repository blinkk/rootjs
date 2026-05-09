/**
 * Unit tests for the deterministic helpers in `worker.ts`. The full lease /
 * snapshot integration is exercised via the emulator-backed harness when
 * the user runs the end-to-end flow.
 */

import {describe, expect, it} from 'vitest';
import {buildAgentPrompt} from './worker.js';

describe('buildAgentPrompt', () => {
  it('combines title and description into a markdown prompt', () => {
    expect(
      buildAgentPrompt({
        title: 'Translate the homepage',
        description: 'Localize EN -> FR.',
      })
    ).toBe('# Translate the homepage\n\nLocalize EN -> FR.');
  });

  it('omits description when missing', () => {
    expect(buildAgentPrompt({title: 'Just a title'})).toBe('# Just a title');
  });

  it('omits title heading when only description is set', () => {
    expect(buildAgentPrompt({description: 'desc only'})).toBe('desc only');
  });

  it('falls back to a generic instruction when both are empty', () => {
    expect(buildAgentPrompt({})).toMatch(/Investigate this task/);
  });

  it('trims whitespace', () => {
    expect(
      buildAgentPrompt({title: '   spaced   ', description: '   body   '})
    ).toBe('# spaced\n\nbody');
  });
});
