import {beforeEach, describe, expect, it, vi} from 'vitest';
import {defineAgent} from './define.js';
import {_resetAgentRegistryForTests, getAgent, loadAgents} from './registry.js';

const state = vi.hoisted(() => ({
  modules: {} as Record<string, unknown>,
}));

vi.mock('virtual:root/agents', () => ({
  get AGENT_MODULES() {
    return state.modules;
  },
}));

beforeEach(() => {
  state.modules = {};
  _resetAgentRegistryForTests();
});

describe('loadAgents', () => {
  it('returns an empty map when no agents are declared', async () => {
    const agents = await loadAgents();
    expect(agents.size).toBe(0);
  });

  it('loads agents exported as default', async () => {
    state.modules = {
      '/agents/content-manager.ts': {
        default: defineAgent({
          name: 'content-manager',
          icon: '📝',
          description: 'Manages content.',
          systemPrompt: 'You manage content.',
        }),
      },
      '/agents/translator.ts': {
        default: defineAgent({
          name: 'translator',
          icon: '🌐',
          description: 'Translates copy.',
          systemPrompt: 'You translate copy.',
        }),
      },
    };
    const agents = await loadAgents();
    expect(agents.size).toBe(2);
    expect(agents.get('content-manager')?.icon).toBe('📝');
    expect(agents.get('translator')?.icon).toBe('🌐');
  });

  it('also accepts a named `agent` export', async () => {
    state.modules = {
      '/agents/content-manager.ts': {
        agent: defineAgent({
          name: 'content-manager',
          icon: '📝',
          description: 'Manages content.',
          systemPrompt: 'You manage content.',
        }),
      },
    };
    const agents = await loadAgents();
    expect(agents.get('content-manager')).toBeDefined();
  });

  it('throws on duplicate agent names', async () => {
    state.modules = {
      '/agents/a.ts': {
        default: defineAgent({
          name: 'duplicate',
          icon: '📝',
          description: 'A',
          systemPrompt: 'A',
        }),
      },
      '/agents/b.ts': {
        default: defineAgent({
          name: 'duplicate',
          icon: '🌐',
          description: 'B',
          systemPrompt: 'B',
        }),
      },
    };
    await expect(loadAgents()).rejects.toThrow(/duplicate agent name/);
  });

  it('throws when an agent file is missing a default export', async () => {
    state.modules = {
      '/agents/oops.ts': {},
    };
    await expect(loadAgents()).rejects.toThrow(/does not export a default/);
  });

  it('throws when an export is not a valid agent definition', async () => {
    state.modules = {
      '/agents/oops.ts': {default: {name: 'incomplete'}},
    };
    await expect(loadAgents()).rejects.toThrow(/not a valid agent definition/);
  });

  it('caches across calls', async () => {
    state.modules = {
      '/agents/content-manager.ts': {
        default: defineAgent({
          name: 'content-manager',
          icon: '📝',
          description: 'Manages content.',
          systemPrompt: 'You manage content.',
        }),
      },
    };
    const a = await loadAgents();
    state.modules = {}; // Should be ignored due to caching.
    const b = await loadAgents();
    expect(a).toBe(b);
    expect(b.has('content-manager')).toBe(true);
  });
});

describe('getAgent', () => {
  it('returns the agent by name', async () => {
    state.modules = {
      '/agents/content-manager.ts': {
        default: defineAgent({
          name: 'content-manager',
          icon: '📝',
          description: 'Manages content.',
          systemPrompt: 'You manage content.',
        }),
      },
    };
    const agent = await getAgent('content-manager');
    expect(agent?.name).toBe('content-manager');
  });

  it('returns null for unknown names', async () => {
    const agent = await getAgent('does-not-exist');
    expect(agent).toBeNull();
  });
});
