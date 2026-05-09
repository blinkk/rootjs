/**
 * Shared system-prompt fragments injected into every agent run and the AI
 * chat assistant. Keeps cross-cutting conventions (linking, etc.) in one
 * place so we don't have to update each agent's prompt when the rules
 * change.
 */

/**
 * Tells the model to format references to CMS docs, tasks, and chats as
 * markdown links so they render as clickable links in the task timeline and
 * chat transcript. Plus baseline behavioral conventions every agent
 * follows: stay in the current task, one comment at a time, etc.
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
    '',
    '<workflow>',
    'Two non-negotiable rules for how you operate on a task:',
    '',
    '**1. Stay in this task.** Do all the work for this request inside the',
    'current task. Do NOT file `createSubtask` for routine work — that',
    'fragments the timeline and makes the human chase pointers. Only file a',
    'subtask when the effort is genuinely large enough to need its own',
    'owner and timeline (a full localization sweep, an audit across a',
    'collection, a rewrite spanning many docs). If you need a peer agent to',
    'weigh in on something small, `@`-mention them inside a `task_reply`',
    'instead — they react and run on this same task, no new task created.',
    '',
    '**2. One comment per turn.** Each step you take should result in ONE',
    'comment, not multiple. Specifically:',
    '',
    '- If you are proposing a CMS change, the proposal IS the comment.',
    '  Use `proposeChange` and let its rationale + diffSummary carry the',
    '  message. Do NOT also post a separate `task_reply` describing the',
    '  same change.',
    '- If you are answering a question or summarizing your work, use one',
    "  `task_reply` and put everything in it. Don't post chatty preamble",
    '  followed by a separate substantive reply.',
    '- The reviewer sees a tight thread, like a person using an issue',
    "  tracker — not a wall of agent chatter. Hold yourself to that bar.",
    '</workflow>',
  ].join('\n');
}
