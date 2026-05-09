/**
 * Unit tests for the deterministic helpers in `worker.ts`. The full lease /
 * snapshot integration is exercised via the emulator-backed harness when
 * the user runs the end-to-end flow.
 */

import {describe, expect, it} from 'vitest';
import {buildAgentPrompt} from './worker.js';

describe('buildAgentPrompt', () => {
  it('includes the task title and description', () => {
    const out = buildAgentPrompt({
      title: 'Translate the homepage',
      description: 'Localize EN -> FR.',
    });
    expect(out).toContain('# Task');
    expect(out).toContain('**Translate the homepage**');
    expect(out).toContain('Localize EN -> FR.');
  });

  it('always appends a "Your turn" footer', () => {
    expect(buildAgentPrompt({title: 'x'})).toContain('# Your turn');
  });

  it('falls back to a generic instruction when both fields are empty', () => {
    expect(buildAgentPrompt({})).toMatch(/Investigate this task/);
  });

  it('trims whitespace on title and description', () => {
    const out = buildAgentPrompt({
      title: '   spaced   ',
      description: '   body   ',
    });
    expect(out).toContain('**spaced**');
    expect(out).toContain('body');
    expect(out).not.toContain('**   spaced   **');
  });

  it('renders prior comments under a Conversation history heading', () => {
    const out = buildAgentPrompt({title: 'Pick a color'}, [
      {createdBy: 'alex@example.com', content: 'use blue'},
      {createdBy: 'agent:editor', content: 'noted'},
    ]);
    expect(out).toContain('# Conversation history');
    expect(out).toContain('alex@example.com');
    expect(out).toContain('use blue');
    expect(out).toContain('🤖 editor (agent)');
  });

  it('renders proposal comments distinctly from regular comments', () => {
    const out = buildAgentPrompt({title: 'Update copy'}, [
      {
        createdBy: 'agent:editor',
        content: 'Proposal: doc_updateField',
        proposal: {
          tool: 'doc_updateField',
          rationale: 'tighten the headline',
          diffSummary: '- old\n+ new',
          status: 'rejected',
        },
      },
    ]);
    expect(out).toContain('proposal');
    expect(out).toContain('doc_updateField');
    expect(out).toContain('rejected');
    expect(out).toContain('tighten the headline');
  });

  it('skips deleted comments', () => {
    const out = buildAgentPrompt({title: 't'}, [
      {createdBy: 'a@x.com', content: 'visible'},
      {createdBy: 'b@x.com', content: 'gone', isDeleted: true},
    ]);
    expect(out).toContain('visible');
    expect(out).not.toContain('gone');
  });
});
