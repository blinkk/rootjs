import {SpotlightActionProps} from '@mantine/spotlight';
import type {GlobalSearchHit} from '../../hooks/useGlobalSearch.js';

const SNIPPET_BEFORE = 60;
const SNIPPET_AFTER = 120;

/**
 * Returns the highlighted text + surrounding context for a search hit.
 *
 * If any of the matched terms appears in `hit.text`, returns a snippet
 * windowed around the first occurrence with the term wrapped in <mark>. If
 * none of the terms match (e.g. fuzzy hit on the field label), returns the
 * full text with no highlighting.
 */
function buildSnippet(hit: GlobalSearchHit): {
  pre: string;
  mark: string;
  post: string;
} {
  const text = hit.text || '';
  const terms = (hit.terms || [])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!terms.length || !text) {
    return {pre: text, mark: '', post: ''};
  }
  const lower = text.toLowerCase();
  let foundAt = -1;
  let foundLen = 0;
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx !== -1) {
      foundAt = idx;
      foundLen = term.length;
      break;
    }
  }
  if (foundAt === -1) {
    return {
      pre: text.slice(0, SNIPPET_BEFORE + SNIPPET_AFTER),
      mark: '',
      post: '',
    };
  }
  const start = Math.max(0, foundAt - SNIPPET_BEFORE);
  const end = Math.min(text.length, foundAt + foundLen + SNIPPET_AFTER);
  const pre = (start > 0 ? '… ' : '') + text.slice(start, foundAt);
  const mark = text.slice(foundAt, foundAt + foundLen);
  const post =
    text.slice(foundAt + foundLen, end) + (end < text.length ? ' …' : '');
  return {pre, mark, post};
}

export function GlobalSearchAction(props: SpotlightActionProps) {
  const action = props.action as any;

  // Footer pseudo-action: render a non-interactive timestamp row.
  if (action?.__footer && action?.lastIndexed) {
    return (
      <div className="GlobalSearchAction GlobalSearchAction--footer">
        Last indexed {action.lastIndexed}
      </div>
    );
  }

  const hit = action?.hit as GlobalSearchHit | undefined;
  if (!hit) {
    return null;
  }
  const snippet = buildSnippet(hit);
  return (
    <button
      type="button"
      className={
        'GlobalSearchAction' +
        (props.hovered ? ' GlobalSearchAction--hovered' : '')
      }
      onMouseDown={(e) => {
        // mousedown so the click registers before Spotlight closes the modal.
        e.preventDefault();
        props.onTrigger();
      }}
    >
      <div className="GlobalSearchAction__crumbs">
        <span className="GlobalSearchAction__collection">{hit.collection}</span>
        <span className="GlobalSearchAction__sep">/</span>
        <span className="GlobalSearchAction__slug">{hit.slug}</span>
        <span className="GlobalSearchAction__sep">·</span>
        <span className="GlobalSearchAction__field">{hit.fieldLabel}</span>
      </div>
      <div className="GlobalSearchAction__snippet">
        <span>{snippet.pre}</span>
        {snippet.mark && (
          <mark className="GlobalSearchAction__mark">{snippet.mark}</mark>
        )}
        <span>{snippet.post}</span>
      </div>
    </button>
  );
}
