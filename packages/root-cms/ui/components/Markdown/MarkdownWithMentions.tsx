import './MarkdownWithMentions.css';

import {useMemo} from 'preact/hooks';
import {useAgents, type AgentSummary} from '../../hooks/useAgents.js';
import {Markdown} from './Markdown.js';

export interface MarkdownWithMentionsProps {
  className?: string;
  code: string;
  inline?: boolean;
}

/**
 * Markdown renderer that highlights `@<agent-name>` mentions inline as
 * tooltipped chips. Falls back to the plain Markdown renderer when no
 * agents are registered or no mentions are present in the source.
 *
 * Wraps the existing `<Markdown>` (which uses `marked` and trusts HTML)
 * by pre-substituting matched mentions with `<span class="...">...</span>`
 * before parsing — keeps a single source of truth for markdown handling.
 */
export function MarkdownWithMentions(props: MarkdownWithMentionsProps) {
  const {agents} = useAgents();
  const enhanced = useMemo(
    () => highlightAgentMentions(props.code, agents),
    [props.code, agents]
  );
  return (
    <Markdown
      className={props.className}
      code={enhanced}
      inline={props.inline}
    />
  );
}

/**
 * Replaces `@<agent-name>` tokens in `text` with `<span>` chips showing the
 * agent's description as a tooltip. Mentions inside code blocks/inline code
 * are left untouched (we run BEFORE markdown parsing, but only match
 * tokens preceded by a word boundary that isn't `\``).
 */
export function highlightAgentMentions(
  text: string,
  agents: AgentSummary[]
): string {
  if (!text || agents.length === 0) {
    return text;
  }
  const map = new Map(agents.map((a) => [a.name.toLowerCase(), a]));
  return text.replace(
    /(^|[\s>(])@([a-z0-9][a-z0-9-]*)\b(?![A-Za-z0-9._%+-]*@)/g,
    (match, prefix, name) => {
      const agent = map.get(name.toLowerCase());
      if (!agent) {
        return match;
      }
      const tooltip = `@${agent.name} — ${agent.description}`;
      const safe = escapeAttr(tooltip);
      const dispatcher = agent.dispatcher
        ? ' AgentMentionInline--dispatcher'
        : '';
      return `${prefix}<span class="AgentMentionInline${dispatcher}" title="${safe}" data-agent="${agent.name}">@${agent.name}</span>`;
    }
  );
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
