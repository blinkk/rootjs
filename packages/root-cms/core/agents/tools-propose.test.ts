/**
 * Unit tests for the proposeChange tool. Validates that the tool exists,
 * has the expected schema fields, and rejects mutating tools outside the
 * allowlist when invoked. The Firestore write path is covered by the
 * worker integration tests in PR 3.
 */

import {describe, expect, it} from 'vitest';
import type {AgentRunContext} from './run-context.js';
import {PROPOSAL_TARGET_TOOLS, createProposeTool} from './tools-propose.js';

function makeCtx() {
  return {
    agent: {
      name: 'test-agent',
      icon: '🧪',
      description: 'Test',
      systemPrompt: 'Test',
      allowedTools: ['propose'],
    },
    cmsClient: {} as never,
    db: {} as never,
    projectId: 'test',
    taskId: '1',
    createdBy: 'agent:test-agent',
  } as unknown as AgentRunContext;
}

describe('createProposeTool', () => {
  it('exposes a single proposeChange tool', () => {
    const tools = createProposeTool(makeCtx());
    expect(Object.keys(tools)).toEqual(['proposeChange']);
  });

  it('rejects unknown target tool names', async () => {
    const tools = createProposeTool(makeCtx());
    const tool = tools.proposeChange;
    expect(tool.execute).toBeDefined();
    await expect(
      tool.execute!(
        {
          tool: 'doc_publish',
          input: {docId: 'Pages/home'},
          rationale: 'should be rejected',
        },
        // The ai-sdk passes a runtime context; we don't use it.
        {} as never
      )
    ).rejects.toThrow(/unsupported tool "doc_publish"/);
  });

  it('whitelists the documented mutating tools', () => {
    expect(PROPOSAL_TARGET_TOOLS).toEqual([
      'doc_set',
      'doc_create',
      'doc_updateField',
      'doc_duplicate',
      'doc_translateField',
    ]);
  });
});
