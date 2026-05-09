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
 */

import type {AgentDefinition} from './types.js';

interface AgentModuleExports {
  default?: AgentDefinition;
  agent?: AgentDefinition;
}

interface AgentModulesShape {
  AGENT_MODULES?: Record<string, AgentModuleExports>;
}

let cache: ReadonlyMap<string, AgentDefinition> | null = null;

/**
 * Loads all agents declared in `<rootDir>/agents/`, returning a name-keyed map.
 *
 * Throws if duplicate agent names are encountered or an exported value is not
 * a valid agent definition.
 */
export async function loadAgents(): Promise<
  ReadonlyMap<string, AgentDefinition>
> {
  if (cache) {
    return cache;
  }

  let mod: AgentModulesShape;
  try {
    // The virtual module is resolved by rootPodsVitePlugin when loaded
    // through Vite's ssrLoadModule. Outside Vite (CLI, tests without the
    // stub), it falls back to an empty registry.
    // @ts-expect-error — virtual module provided by rootPodsVitePlugin.
    mod = (await import('virtual:root/agents')) as AgentModulesShape;
  } catch (err) {
    cache = new Map();
    return cache;
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
  cache = byName;
  return cache;
}

/**
 * Returns a single agent by name, or null if no such agent is registered.
 */
export async function getAgent(name: string): Promise<AgentDefinition | null> {
  const agents = await loadAgents();
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
    typeof v.icon === 'string' &&
    typeof v.description === 'string' &&
    typeof v.systemPrompt === 'string' &&
    Array.isArray(v.allowedTools)
  );
}
