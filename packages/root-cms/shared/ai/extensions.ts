/**
 * Browser-safe types and helpers for the custom Root AI tools and skills that
 * projects and plugins register (see `core/ai-extensions.ts` for the
 * server-side definitions).
 */

/**
 * Pattern for tool and skill names. Kept compatible with every provider's
 * tool-name rules (OpenAI, Anthropic and Gemini all accept this subset).
 */
export const AI_EXTENSION_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/** A custom tool serialized for the browser (no `execute`). */
export interface SerializedAiTool {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
  /**
   * Whether the tool has side effects. Write tools are omitted in read-only
   * mode and always pause for the user's approval before running.
   */
  write: boolean;
}

/** A skill summary for the composer's `/` autocomplete menu. */
export interface SerializedAiSkillSummary {
  name: string;
  description?: string;
}

/** A skill serialized for the browser, including its instructions. */
export interface SerializedAiSkill extends SerializedAiSkillSummary {
  instructions: string;
}

/**
 * Returns the skill name a message invokes, i.e. the `name` in a message that
 * starts with `/name`, or `null`.
 */
export function parseSkillInvocation(
  text: string
): {name: string; rest: string} | null {
  const match = text.match(/^\/([a-zA-Z][a-zA-Z0-9_-]*)(?:\s+|$)([\s\S]*)$/);
  if (!match) {
    return null;
  }
  return {name: match[1], rest: match[2]};
}

/**
 * Formats the model-facing text for a message that invokes a skill: the
 * skill's instructions followed by the rest of the user's message.
 */
export function formatSkillInvocation(
  skill: SerializedAiSkill,
  rest: string
): string {
  const lines = [
    `The user invoked the \`/${skill.name}\` skill. Follow the skill's`,
    'instructions below for this request.',
    '',
    `<skill name="${skill.name}">`,
    skill.instructions.trim(),
    '</skill>',
  ];
  if (rest.trim()) {
    lines.push('', 'User message:', rest.trim());
  }
  return lines.join('\n');
}

/**
 * Expands `/skill` invocations in user messages into the skill's instructions,
 * so the transcript keeps showing what the user typed while the model sees the
 * full instructions. Messages that don't start with a known skill are
 * returned unchanged.
 */
export function expandSkillInvocations<
  T extends {role: string; parts: Array<{type: string; text?: string}>},
>(messages: T[], skills: SerializedAiSkill[] | undefined): T[] {
  if (!skills?.length) {
    return messages;
  }
  const skillsByName = new Map(skills.map((s) => [s.name, s]));
  return messages.map((message) => {
    if (message.role !== 'user') {
      return message;
    }
    const index = message.parts.findIndex((p) => p.type === 'text');
    const part = message.parts[index];
    const invocation = part ? parseSkillInvocation(part.text || '') : null;
    const skill = invocation && skillsByName.get(invocation.name);
    if (!skill) {
      return message;
    }
    const parts = [...message.parts];
    parts[index] = {
      ...part,
      text: formatSkillInvocation(skill, invocation!.rest),
    };
    return {...message, parts} as T;
  });
}
