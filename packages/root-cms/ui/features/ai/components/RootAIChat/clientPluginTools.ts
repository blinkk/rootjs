/**
 * Browser-side wrappers for the custom Root AI tools that projects and plugins
 * register (see `core/ai-extensions.ts`). The tools' schemas come from the
 * `ai.chat.prepare` response, and every call runs on the server via
 * `/cms/api/ai.tools.call`.
 *
 * Read tools carry an `execute` so they run inside the `streamText` loop.
 * Write tools are schema-only, so they surface through `useChat`'s
 * `onToolCall` and pause for the user's approval first.
 */
import {jsonSchema, tool, type ToolSet} from 'ai';
import type {SerializedAiTool} from '../../../../../shared/ai/extensions.js';
import type {CmsToolPreview} from './cmsToolHandlers.js';

/** Builds the `ToolSet` for the custom tools. */
export function createClientPluginTools(tools: SerializedAiTool[]): ToolSet {
  const out: ToolSet = {};
  for (const def of tools) {
    const inputSchema = jsonSchema(def.inputSchema as any);
    out[def.name] = def.write
      ? tool({description: def.description, inputSchema})
      : tool({
          description: def.description,
          inputSchema,
          execute: (input) => executePluginTool(def.name, input),
        });
  }
  return out;
}

/**
 * Runs a custom tool on the server. Errors are returned as tool output (not
 * thrown) so the model can read them and recover.
 */
export async function executePluginTool(
  name: string,
  input: unknown
): Promise<unknown> {
  try {
    const res = await fetch('/cms/api/ai.tools.call', {
      method: 'POST',
      credentials: 'include',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({name, input}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'TOOL_ERROR',
        message: data.message || `ai.tools.call failed: ${res.status}`,
      };
    }
    return data.output;
  } catch (err: any) {
    return {
      success: false,
      error: 'TOOL_ERROR',
      message: err?.message || String(err),
    };
  }
}

/** Builds the approval card preview for a custom write tool call. */
export function previewPluginWriteTool(
  name: string,
  input: unknown
): CmsToolPreview {
  const details = Object.entries((input as Record<string, unknown>) || {}).map(
    ([label, value]) => ({
      label,
      value: truncate(
        typeof value === 'string' ? value : String(JSON.stringify(value))
      ),
    })
  );
  return {
    toolName: name,
    title: `Run ${name}`,
    summary: 'This tool can make changes outside of CMS drafts.',
    details,
    approveLabel: 'Run tool',
  };
}

function truncate(value: string, maxLength = 200): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}
