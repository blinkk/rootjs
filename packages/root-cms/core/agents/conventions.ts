/**
 * Shared system-prompt fragments injected into every agent run and the AI
 * chat assistant. Keeps cross-cutting conventions (linking, etc.) in one
 * place so we don't have to update each agent's prompt when the rules
 * change.
 */

/**
 * Tells the model to format references to CMS docs, tasks, and chats as
 * markdown links so they render as clickable links in the task timeline and
 * chat transcript. Without this, agents tend to write bare ids like
 * `Pages/home` or `#42` which the user can't click.
 */
export function getLinkingConventions(): string {
  return [
    '<linking>',
    'Whenever you reference a CMS document, a task, an agent, or a chat,',
    'format it as a markdown link so the reader can navigate. Conventions:',
    '',
    '- CMS document → `[Pages/home](/cms/content/Pages/home)`. The path is',
    '  always `/cms/content/<Collection>/<slug>`. Use this format both for',
    '  docs you proposed changes to and for any doc you mention in passing.',
    '- Task → `[#42](/cms/tasks/42)`. Always include the `#` so the link',
    '  reads naturally inline.',
    '- Chat → `[chat](/cms/ai/chat/<id>)` when referring back to a',
    '  conversation that spawned the current task.',
    '- Agent → `@<name>` (no markdown link). The UI renders agent mentions',
    "  with the agent's icon automatically.",
    '',
    'Do NOT bare-quote ids like `Pages/home` or `#42` outside of a',
    'markdown link, except inside a fenced code block. The reader needs to',
    "be one click away from the thing you're talking about.",
    '</linking>',
  ].join('\n');
}
