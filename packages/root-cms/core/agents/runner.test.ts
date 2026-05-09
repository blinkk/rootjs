/**
 * Unit tests for `buildAgentToolset`. The full runner loop exercises
 * `generateText` and admin Firestore writes; those are covered by the
 * worker integration tests in PR 3.
 */

import {describe, expect, it} from 'vitest';
import {defineAgent} from './define.js';
import type {AgentRunContext} from './run-context.js';
import {buildAgentToolset} from './runner.js';

function makeCtx(toolBundles: ('read' | 'propose' | 'subtask')[]) {
  const agent = defineAgent({
    name: 'test-agent',
    icon: '🧪',
    description: 'Test agent.',
    systemPrompt: 'You are a test agent.',
    allowedTools: toolBundles,
  });
  // Stub context — these tools never get invoked, only their schemas
  // are inspected.
  const ctx = {
    agent,
    cmsClient: {projectId: 'test-project', rootConfig: {}} as never,
    db: {} as never,
    projectId: 'test-project',
    taskId: '1',
    createdBy: 'agent:test-agent',
  } as AgentRunContext;
  return ctx;
}

describe('buildAgentToolset', () => {
  it('returns no tools for an empty bundle list', () => {
    const tools = buildAgentToolset(makeCtx([]), []);
    expect(Object.keys(tools)).toEqual([]);
  });

  it('grants the read bundle exactly the documented read tools', () => {
    const tools = buildAgentToolset(makeCtx(['read']), ['read']);
    expect(Object.keys(tools).sort()).toEqual([
      'agents_list',
      'check_run',
      'checks_list',
      'collections_list',
      'doc_get',
      'doc_getVersion',
      'doc_listVersions',
      'docs_list',
      'docs_search',
      'schema_get',
      'task_reply',
      'tasks_list',
      'users_list',
    ]);
  });

  it('grants the propose bundle exactly proposeChange', () => {
    const tools = buildAgentToolset(makeCtx(['propose']), ['propose']);
    expect(Object.keys(tools)).toEqual(['proposeChange']);
  });

  it('grants the subtask bundle exactly createSubtask', () => {
    const tools = buildAgentToolset(makeCtx(['subtask']), ['subtask']);
    expect(Object.keys(tools)).toEqual(['createSubtask']);
  });

  it('combines bundles when multiple are granted', () => {
    const tools = buildAgentToolset(makeCtx(['read', 'propose', 'subtask']), [
      'read',
      'propose',
      'subtask',
    ]);
    expect(Object.keys(tools)).toContain('docs_list');
    expect(Object.keys(tools)).toContain('proposeChange');
    expect(Object.keys(tools)).toContain('createSubtask');
  });
});
