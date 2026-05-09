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
export type AgentToolBundle = 'read' | 'propose' | 'subtask' | 'apply';

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
  /**
   * Optional avatar image URL. When omitted the UI renders a colored circle
   * with the agent's first letter (color derived deterministically from the
   * name so the same agent gets the same color across surfaces).
   *
   * Use absolute URLs (`https://...`) or root-relative paths (`/avatars/...`).
   */
  iconUrl?: string;
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
  /**
   * When true, this agent is a "dispatcher" — the user-facing front-of-house
   * that delegates to specialist agents instead of doing the work itself.
   * Sites typically have one (e.g. `@blinkk`) but can declare multiple.
   *
   * Dispatcher agents:
   * - Are surfaced first in the AgentPicker (above non-dispatchers).
   * - Are the default selection in the chat → task conversion flow when no
   *   other agent is named.
   * - Should be granted `read + subtask` (and optionally `apply`) so they
   *   can route work and approve peer proposals without doing CMS edits
   *   themselves.
   */
  dispatcher?: boolean;
}

/**
 * Loose input shape accepted by `defineAgent()`. `allowedTools` is optional
 * here and gets defaulted by the helper.
 */
export interface AgentDefinitionInput {
  name: string;
  /** Optional URL to an avatar image. Falls back to a colored letter avatar. */
  iconUrl?: string;
  description: string;
  systemPrompt: string;
  allowedTools?: AgentToolBundle[];
  model?: string;
  maxTokensPerTask?: number;
  dispatcher?: boolean;
}
