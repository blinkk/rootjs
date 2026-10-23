/**
 * Custom Root AI tools and skills.
 *
 * Projects register them on `cmsPlugin({ai: {tools, skills}})`, and any other
 * Root.js plugin can contribute them through a `rootAi` property:
 *
 * ```ts
 * import {
 *   defineAiSkill,
 *   defineAiTool,
 *   type RootAiPlugin,
 * } from '@blinkk/root-cms/plugin';
 * import {z} from 'zod';
 *
 * export function inventoryPlugin(): RootAiPlugin {
 *   return {
 *     name: 'inventory',
 *     rootAi: {
 *       tools: [
 *         defineAiTool({
 *           name: 'inventory_lookup',
 *           description: 'Looks up the stock level for a product SKU.',
 *           inputSchema: z.object({sku: z.string()}),
 *           execute: async ({sku}, ctx) => {
 *             return await fetchStock(sku, {user: ctx.user.email});
 *           },
 *         }),
 *       ],
 *       skills: [
 *         defineAiSkill({
 *           name: 'launch-checklist',
 *           description: 'Reviews a page against the launch checklist.',
 *           instructions: 'Read the page with doc_get, then ...',
 *         }),
 *       ],
 *     },
 *   };
 * }
 * ```
 *
 * The chat streams from the browser, so the browser gets each tool's name,
 * description and JSON Schema, and calls `/cms/api/ai.tools.call` to run it.
 * `execute` always runs on the server, so it can use secrets and server-only
 * APIs. Skills are invoked by typing `/<name>` in the chat composer.
 */
import {Plugin, Request, RootConfig} from '@blinkk/root';
import {asSchema, type FlexibleSchema} from 'ai';
import {
  AI_EXTENSION_NAME_PATTERN,
  SerializedAiSkill,
  SerializedAiSkillSummary,
  SerializedAiTool,
} from '../shared/ai/extensions.js';
import {GOOGLE_TOOL_NAMES} from './ai-tools-google.js';
import {CMS_TOOL_NAMES} from './ai-tools.js';
import type {RootCMSClient, UserRole} from './client.js';

/** Context passed to a custom tool's `execute` function. */
export interface AiToolContext {
  /** The incoming `/cms/api/ai.tools.call` request. */
  req: Request;
  rootConfig: RootConfig;
  /** The signed-in CMS user. */
  user: {email: string};
  /** The user's role on the CMS project. */
  role: UserRole;
  /** A CMS client for reading and writing CMS content. */
  cmsClient: RootCMSClient;
}

/** A custom tool the Root AI chat model can call. */
export interface AiTool<INPUT = any, OUTPUT = unknown> {
  /**
   * Unique tool name, e.g. `inventory_lookup`. Must start with a letter and
   * contain only letters, numbers, `_` and `-` (max 64 chars), and must not
   * clash with a built-in tool.
   */
  name: string;
  /** Tells the model what the tool does and when to use it. */
  description: string;
  /** Input schema, e.g. a zod schema or `jsonSchema()` from `ai`. */
  inputSchema: FlexibleSchema<INPUT>;
  /**
   * Set to `true` if the tool has side effects (writes data, sends messages,
   * etc.). Write tools are left out in the chat's read-only mode and always
   * pause for the user's approval before running, in every mode.
   */
  write?: boolean;
  /**
   * Roles allowed to use the tool. Defaults to every role for read tools and
   * to `ADMIN`, `EDITOR` and `CONTRIBUTOR` for write tools.
   */
  roles?: UserRole[];
  /**
   * Runs the tool on the server. The input has already been validated against
   * `inputSchema`. The return value is sent back to the model and must be
   * JSON-serializable. Throw to report an error to the model.
   */
  execute: (input: INPUT, ctx: AiToolContext) => OUTPUT | Promise<OUTPUT>;
}

/**
 * A reusable set of instructions the user can invoke from the chat composer
 * by typing `/<name>`.
 */
export interface AiSkill {
  /** Skill name, typed as `/<name>`. Same naming rules as tools. */
  name: string;
  /** Short description shown in the composer's autocomplete menu. */
  description?: string;
  /**
   * Instructions sent to the model when the skill is invoked, along with
   * anything the user typed after `/<name>`.
   */
  instructions: string;
}

/** Custom tools and skills contributed to Root AI. */
export interface AiExtensions {
  tools?: AiTool[];
  skills?: AiSkill[];
}

/** A Root.js plugin that contributes custom tools and skills to Root AI. */
export type RootAiPlugin = Plugin & {
  rootAi?: AiExtensions;
};

/**
 * Helper for defining a custom tool with the `execute` input type inferred
 * from `inputSchema`.
 */
export function defineAiTool<INPUT, OUTPUT>(
  tool: AiTool<INPUT, OUTPUT>
): AiTool<INPUT, OUTPUT> {
  return tool;
}

/** Helper for defining a skill, for consistency with `defineAiTool`. */
export function defineAiSkill(skill: AiSkill): AiSkill {
  return skill;
}

const RESERVED_TOOL_NAMES = new Set<string>([
  ...CMS_TOOL_NAMES,
  ...GOOGLE_TOOL_NAMES,
]);

const DEFAULT_WRITE_ROLES: UserRole[] = ['ADMIN', 'EDITOR', 'CONTRIBUTOR'];

/** Warning messages already logged by `getAiExtensions`. */
const loggedWarnings = new Set<string>();

function warnOnce(message: string) {
  if (!loggedWarnings.has(message)) {
    loggedWarnings.add(message);
    console.warn(`[root-cms] ${message}`);
  }
}

/**
 * Returns the custom tools and skills registered on the cmsPlugin `ai` config
 * and by other plugins' `rootAi` property. Invalid or duplicate entries are
 * skipped with a warning (the first registration of a name wins).
 */
export function getAiExtensions(rootConfig: RootConfig): {
  tools: AiTool[];
  skills: AiSkill[];
} {
  const sources: Array<{source: string; extensions: AiExtensions}> = [];
  for (const plugin of rootConfig.plugins || []) {
    if (plugin.name === 'root-cms') {
      const ai = (plugin as any).getConfig?.().ai as AiExtensions | undefined;
      if (ai) {
        sources.push({source: 'cmsPlugin', extensions: ai});
      }
    }
    const rootAi = (plugin as RootAiPlugin).rootAi;
    if (rootAi) {
      sources.push({source: plugin.name || 'plugin', extensions: rootAi});
    }
  }

  const tools = new Map<string, AiTool>();
  const skills = new Map<string, AiSkill>();
  for (const {source, extensions} of sources) {
    for (const tool of extensions.tools || []) {
      const name = tool?.name;
      if (!AI_EXTENSION_NAME_PATTERN.test(name || '')) {
        warnOnce(`ignoring ai tool with invalid name "${name}" (${source})`);
      } else if (RESERVED_TOOL_NAMES.has(name)) {
        warnOnce(`ignoring ai tool "${name}" (${source}): name is reserved`);
      } else if (tools.has(name)) {
        warnOnce(`ignoring duplicate ai tool "${name}" (${source})`);
      } else if (typeof tool.execute !== 'function' || !tool.inputSchema) {
        warnOnce(`ignoring ai tool "${name}" (${source}): missing execute`);
      } else {
        tools.set(name, tool);
      }
    }
    for (const skill of extensions.skills || []) {
      const name = skill?.name;
      if (!AI_EXTENSION_NAME_PATTERN.test(name || '')) {
        warnOnce(`ignoring ai skill with invalid name "${name}" (${source})`);
      } else if (skills.has(name)) {
        warnOnce(`ignoring duplicate ai skill "${name}" (${source})`);
      } else if (!skill.instructions?.trim()) {
        warnOnce(`ignoring ai skill "${name}" (${source}): no instructions`);
      } else {
        skills.set(name, skill);
      }
    }
  }
  return {
    tools: Array.from(tools.values()),
    skills: Array.from(skills.values()),
  };
}

/** Returns whether a user with `role` may use `tool`. */
export function testCanUseAiTool(tool: AiTool, role: UserRole): boolean {
  const roles = tool.roles || (tool.write ? DEFAULT_WRITE_ROLES : null);
  return !roles || roles.includes(role);
}

/**
 * Serializes the tools available to a user for the browser. Write tools are
 * left out in read-only mode.
 */
export async function serializeAiTools(
  tools: AiTool[],
  options: {role: UserRole; readOnly: boolean}
): Promise<SerializedAiTool[]> {
  const available = tools.filter(
    (tool) =>
      testCanUseAiTool(tool, options.role) && !(options.readOnly && tool.write)
  );
  return Promise.all(
    available.map(async (tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: (await asSchema(tool.inputSchema).jsonSchema) as Record<
        string,
        unknown
      >,
      write: !!tool.write,
    }))
  );
}

/** Serializes skills (with instructions) for the chat transport. */
export function serializeAiSkills(skills: AiSkill[]): SerializedAiSkill[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    instructions: skill.instructions,
  }));
}

/** Serializes skill names and descriptions for the autocomplete menu. */
export function serializeAiSkillSummaries(
  skills: AiSkill[]
): SerializedAiSkillSummary[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
  }));
}

/** Error thrown by `callAiTool` with a machine-readable code. */
export class AiToolCallError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Looks up a custom tool by name, checks the user may use it, validates the
 * input against its schema and runs it.
 */
export async function callAiTool(
  tools: AiTool[],
  name: string,
  input: unknown,
  ctx: AiToolContext
): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new AiToolCallError('UNKNOWN_TOOL', 404, `unknown tool: ${name}`);
  }
  if (!testCanUseAiTool(tool, ctx.role)) {
    throw new AiToolCallError(
      'FORBIDDEN',
      403,
      `your role (${ctx.role}) cannot use the "${name}" tool`
    );
  }
  const schema = asSchema(tool.inputSchema);
  let value = input;
  if (schema.validate) {
    const result = await schema.validate(input);
    if (!result.success) {
      throw new AiToolCallError(
        'INVALID_INPUT',
        400,
        `invalid input for "${name}": ${result.error.message}`
      );
    }
    value = result.value;
  }
  return await tool.execute(value, ctx);
}
