/**
 * Shared types for the Root AI agent registry. Definitions live in user code
 * via `defineAgent()`; the runtime registry, runner, and worker all consume
 * the resolved shape from this module.
 */

/**
 * Capability bundles an agent may be granted. Bundles are coarse-grained on
 * purpose so site authors don't accidentally hand agents dangerous tools and
 * so the underlying tool surface can grow without breaking existing agents.
 */
export type AgentToolBundle = 'read' | 'propose' | 'subtask';

/**
 * Resolved agent definition shape. Returned by `defineAgent()` and registered
 * in the agent registry.
 */
export interface AgentDefinition {
  /**
   * Unique identifier within a project. Must match `/^[a-z0-9][a-z0-9-]*$/`.
   * The assignee form is `agent:<name>`.
   */
  name: string;
  /** Single emoji or short string used as the agent's avatar in the UI. */
  icon: string;
  /** One-line description shown in pickers and lists. */
  description: string;
  /**
   * Full system prompt for the agent. Typically authored as a sibling
   * Markdown file imported via Vite's `?raw` query (e.g.
   * `import sp from './content-manager.md?raw'`).
   */
  systemPrompt: string;
  /** Granted capability bundles. Defaults to `['read', 'propose']`. */
  allowedTools: AgentToolBundle[];
  /**
   * Optional model override of the form `<provider>/<model-id>` (e.g.
   * `anthropic/claude-sonnet-4-6`). When omitted, the project default is used.
   */
  model?: string;
  /**
   * Optional per-task token cap. When the runner exceeds this across all steps
   * (including subagents) the run halts and is marked errored. Defaults to the
   * project default if unset.
   */
  maxTokensPerTask?: number;
}

/**
 * Loose input shape accepted by `defineAgent()`. `allowedTools` is optional
 * here and gets defaulted by the helper.
 */
export interface AgentDefinitionInput {
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  allowedTools?: AgentToolBundle[];
  model?: string;
  maxTokensPerTask?: number;
}
