/**
 * Runtime registry that loads agents declared in a site's `agents/` directory
 * via the `virtual:root/agents` Vite virtual module. Consumed by the agent
 * runner, the API endpoints that serve the agent picker, and the worker.
 *
 * The virtual module exposes:
 *
 *   export const AGENT_MODULES: Record<string, {default?: AgentDefinition}>;
 *
 * keyed by the source path of each agent file. We dedupe by `name` and accept
 * either a default export or a named `agent` export to keep authoring
 * flexible.
 *
 * Loading model:
 * - In dev, callers pass `viteServer` so the virtual module resolves through
 *   Vite's SSR loader (the only way `virtual:` imports work in an Express
 *   handler that wasn't itself loaded via Vite). HMR works automatically:
 *   editing an agent file invalidates the module and the next call sees the
 *   new state.
 * - In prod, callers can omit `viteServer`; the registry falls back to a
 *   standard dynamic import which resolves once the module has been bundled
 *   into the SSR app output.
 */

import type {ViteDevServer} from 'vite';
import type {AgentDefinition} from './types.js';

const VIRTUAL_AGENTS_ID = 'virtual:root/agents';

interface AgentModuleExports {
  default?: AgentDefinition;
  agent?: AgentDefinition;
}

interface AgentModulesShape {
  AGENT_MODULES?: Record<string, AgentModuleExports>;
}

export interface LoadAgentsOptions {
  /**
   * Vite dev server used to resolve the `virtual:root/agents` module. Required
   * in dev; omitted in prod where the module is bundled into the SSR app.
   */
  viteServer?: ViteDevServer;
  /**
   * When true, bypasses the cache and re-reads the virtual module. Used by
   * dev-mode callers so file edits show up without a process restart.
   * Defaults to true when `viteServer` is set, false otherwise.
   */
  fresh?: boolean;
}

let cache: ReadonlyMap<string, AgentDefinition> | null = null;

/**
 * Loads all agents declared in `<rootDir>/agents/`, returning a name-keyed map.
 *
 * Throws if duplicate agent names are encountered or an exported value is not
 * a valid agent definition.
 */
export async function loadAgents(
  options: LoadAgentsOptions = {}
): Promise<ReadonlyMap<string, AgentDefinition>> {
  const fresh = options.fresh ?? Boolean(options.viteServer);
  if (cache && !fresh) {
    return cache;
  }

  let mod: AgentModulesShape;
  try {
    if (options.viteServer) {
      mod = (await options.viteServer.ssrLoadModule(
        VIRTUAL_AGENTS_ID
      )) as AgentModulesShape;
    } else {
      // In prod the agents file lands in the SSR bundle so a standard dynamic
      // import works. In tests, the vitest config stubs the module.
      // @ts-expect-error — virtual module provided by rootPodsVitePlugin.
      mod = (await import('virtual:root/agents')) as AgentModulesShape;
    }
  } catch (err) {
    if (!fresh) {
      cache = new Map();
    }
    return new Map();
  }

  const entries = mod.AGENT_MODULES || {};
  const byName = new Map<string, AgentDefinition>();
  const seenAt = new Map<string, string>();
  for (const [modulePath, exports] of Object.entries(entries)) {
    const def = exports.default || exports.agent;
    if (!def) {
      throw new Error(
        `agents: ${modulePath} does not export a default agent (use \`export default defineAgent({...})\`)`
      );
    }
    if (!isAgentDefinition(def)) {
      throw new Error(
        `agents: ${modulePath} export is not a valid agent definition (did you forget to call defineAgent?)`
      );
    }
    const existing = seenAt.get(def.name);
    if (existing) {
      throw new Error(
        `agents: duplicate agent name "${def.name}" registered by ${existing} and ${modulePath}`
      );
    }
    seenAt.set(def.name, modulePath);
    byName.set(def.name, def);
  }
  if (!fresh) {
    cache = byName;
  }
  return byName;
}

/**
 * Returns a single agent by name, or null if no such agent is registered.
 */
export async function getAgent(
  name: string,
  options: LoadAgentsOptions = {}
): Promise<AgentDefinition | null> {
  const agents = await loadAgents(options);
  return agents.get(name) || null;
}

/**
 * Resets the in-memory cache. Test-only; production code should rely on the
 * one-shot lazy load.
 */
export function _resetAgentRegistryForTests() {
  cache = null;
}

function isAgentDefinition(value: unknown): value is AgentDefinition {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' &&
    (v.iconUrl === undefined || typeof v.iconUrl === 'string') &&
    typeof v.description === 'string' &&
    typeof v.systemPrompt === 'string' &&
    Array.isArray(v.allowedTools)
  );
}
