/**
 * Public API for declaring a Root AI agent in a site's `agents/` directory.
 *
 * Example:
 *   // agents/content-manager.ts
 *   import {defineAgent} from '@blinkk/root-cms';
 *   import systemPrompt from './content-manager.md?raw';
 *
 *   export default defineAgent({
 *     name: 'content-manager',
 *     icon: '📝',
 *     description: 'Manages CMS content updates across collections.',
 *     systemPrompt,
 *     allowedTools: ['read', 'propose'],
 *   });
 */

import type {
  AgentDefinition,
  AgentDefinitionInput,
  AgentToolBundle,
} from './types.js';

const AGENT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const VALID_BUNDLES: ReadonlySet<AgentToolBundle> = new Set([
  'read',
  'propose',
  'subtask',
]);
const DEFAULT_ALLOWED_TOOLS: AgentToolBundle[] = ['read', 'propose'];

/**
 * Validates and normalizes an agent definition. Throws on missing or
 * malformed fields so configuration errors surface at module load time
 * rather than mid-run.
 */
export function defineAgent(input: AgentDefinitionInput): AgentDefinition {
  if (!input || typeof input !== 'object') {
    throw new Error('defineAgent: missing config object');
  }
  const name = (input.name || '').trim();
  if (!name) {
    throw new Error('defineAgent: missing required field "name"');
  }
  if (!AGENT_NAME_PATTERN.test(name)) {
    throw new Error(
      `defineAgent: invalid name "${name}" (must match ${AGENT_NAME_PATTERN})`
    );
  }
  const iconUrl = (input.iconUrl || '').trim() || undefined;
  if (
    iconUrl &&
    !iconUrl.startsWith('/') &&
    !iconUrl.startsWith('http://') &&
    !iconUrl.startsWith('https://') &&
    !iconUrl.startsWith('data:')
  ) {
    throw new Error(
      `defineAgent[${name}]: iconUrl must be an absolute URL, ` +
        'root-relative path (/...), or data: URI'
    );
  }
  const description = (input.description || '').trim();
  if (!description) {
    throw new Error(
      `defineAgent[${name}]: missing required field "description"`
    );
  }
  const systemPrompt = (input.systemPrompt || '').trim();
  if (!systemPrompt) {
    throw new Error(
      `defineAgent[${name}]: missing required field "systemPrompt"`
    );
  }

  const allowedTools = normalizeAllowedTools(name, input.allowedTools);

  if (
    input.maxTokensPerTask !== undefined &&
    (!Number.isFinite(input.maxTokensPerTask) || input.maxTokensPerTask <= 0)
  ) {
    throw new Error(
      `defineAgent[${name}]: maxTokensPerTask must be a positive number`
    );
  }

  return {
    name,
    iconUrl,
    description,
    systemPrompt,
    allowedTools,
    model: input.model?.trim() || undefined,
    maxTokensPerTask: input.maxTokensPerTask,
  };
}

function normalizeAllowedTools(
  agentName: string,
  bundles: AgentToolBundle[] | undefined
): AgentToolBundle[] {
  if (bundles === undefined) {
    return [...DEFAULT_ALLOWED_TOOLS];
  }
  if (!Array.isArray(bundles)) {
    throw new Error(`defineAgent[${agentName}]: allowedTools must be an array`);
  }
  const result: AgentToolBundle[] = [];
  const seen = new Set<AgentToolBundle>();
  for (const bundle of bundles) {
    if (!VALID_BUNDLES.has(bundle)) {
      throw new Error(
        `defineAgent[${agentName}]: unknown tool bundle "${bundle}" ` +
          `(expected one of: ${Array.from(VALID_BUNDLES).join(', ')})`
      );
    }
    if (!seen.has(bundle)) {
      seen.add(bundle);
      result.push(bundle);
    }
  }
  return result;
}
