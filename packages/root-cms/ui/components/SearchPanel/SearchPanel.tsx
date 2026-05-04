import './SearchPanel.css';

import {ActionIcon} from '@mantine/core';
import {IconSearch, IconX} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useCollectionSchema} from '../../hooks/useCollectionSchema.js';
import {useDraftDoc, useDraftDocData} from '../../hooks/useDraftDoc.js';
import {debounce} from '../../utils/debounce.js';
import {
  DocSearchResult,
  OPEN_RICHTEXT_BLOCK_EVENT,
  OPEN_RICHTEXT_INLINE_EVENT,
  OpenRichTextBlockEventDetail,
  OpenRichTextInlineEventDetail,
  searchDocFields,
} from '../../utils/doc-search.js';

export interface SearchPanelProps {
  docId: string;
  /** Called when the user closes the panel (e.g. via the close button). */
  onClose?: () => void;
  /** When true, focus the search input on mount. */
  autoFocus?: boolean;
}

/**
 * A right-side panel that lets content editors search the document's field
 * values. Matches are listed below the input and clicking a result deep-links
 * to the field; for matches inside rich text custom blocks, the corresponding
 * block modal is opened automatically.
 */
export function SearchPanel(props: SearchPanelProps) {
  const collectionId = props.docId.split('/')[0];
  const collection = useCollectionSchema(collectionId);
  const draft = useDraftDoc();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocSearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  // Use refs for values read inside the debounced search callback so that the
  // callback identity is stable across renders (avoiding spurious re-runs).
  const queryRef = useRef('');
  queryRef.current = query;
  const fieldsRef = useRef(collection.schema?.fields || []);
  fieldsRef.current = collection.schema?.fields || [];
  const typesRef = useRef(collection.schema?.types || {});
  typesRef.current = collection.schema?.types || {};

  const runSearch = useMemo(
    () =>
      debounce((q: string) => {
        const trimmed = q.trim();
        if (!trimmed) {
          setResults([]);
          setSearched(false);
          return;
        }
        const data = draft.controller?.getData()?.fields || {};
        const matches = searchDocFields(
          trimmed,
          data,
          fieldsRef.current,
          typesRef.current
        );
        setResults(matches);
        setSearched(true);
      }, 150),
    [draft.controller]
  );

  useEffect(() => {
    runSearch(query);
  }, [query, runSearch]);

  // Re-run the search when the document data changes so the panel stays in
  // sync with edits made elsewhere.
  useDraftDocData(() => {
    if (queryRef.current.trim()) {
      runSearch(queryRef.current);
    }
  });

  useEffect(() => {
    if (props.autoFocus) {
      // Defer to allow the panel to mount before focusing.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [props.autoFocus]);

  // Listen for explicit focus requests (e.g. when the user re-opens the panel
  // via the toolbar button or hotkey).
  useEffect(() => {
    const handler = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('root:focus-search', handler);
    return () => window.removeEventListener('root:focus-search', handler);
  }, []);

  const onResultClick = (result: DocSearchResult) => {
    jumpToSearchResult(result);
  };

  return (
    <div className="SearchPanel">
      <div className="SearchPanel__header">
        <div className="SearchPanel__header__title">Search</div>
        {props.onClose && (
          <ActionIcon size="xs" onClick={props.onClose} title="Close search">
            <IconX size={14} />
          </ActionIcon>
        )}
      </div>
      <div className="SearchPanel__searchInput">
        <span className="SearchPanel__searchInput__icon">
          <IconSearch size={14} />
        </span>
        <input
          ref={inputRef}
          type="text"
          className="SearchPanel__searchInput__input"
          value={query}
          onInput={(e: any) => setQuery(e.currentTarget.value)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Escape' && props.onClose) {
              e.preventDefault();
              props.onClose();
            }
          }}
          placeholder="Search field values…"
          autoComplete="off"
          spellcheck={false}
        />
      </div>
      <div className="SearchPanel__body">
        {!searched && !query.trim() && (
          <div className="SearchPanel__empty">
            Type a query above to search field values in this document.
          </div>
        )}
        {searched && results.length === 0 && (
          <div className="SearchPanel__empty">
            No matches for <strong>{query}</strong>.
          </div>
        )}
        {results.length > 0 && (
          <>
            <div className="SearchPanel__resultsCount">
              {results.length} {results.length === 1 ? 'match' : 'matches'}
            </div>
            <ul className="SearchPanel__results">
              {results.map((result, i) => (
                <SearchResultItem
                  key={`${result.deepKey}:${i}`}
                  result={result}
                  onClick={() => onResultClick(result)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

interface SearchResultItemProps {
  result: DocSearchResult;
  onClick: () => void;
}

function SearchResultItem(props: SearchResultItemProps) {
  const {result} = props;
  return (
    <li className="SearchPanel__result">
      <button
        type="button"
        className="SearchPanel__result__button"
        onClick={props.onClick}
      >
        <div className="SearchPanel__result__label">{result.label}</div>
        <div className="SearchPanel__result__snippet">
          {renderHighlightedSnippet(result.snippet, result.matches)}
        </div>
        <div className="SearchPanel__result__meta">
          <span className="SearchPanel__result__type">{result.fieldType}</span>
          {result.richTextBlock && (
            <span className="SearchPanel__result__badge">in block</span>
          )}
          {result.richTextInline && (
            <span className="SearchPanel__result__badge">inline</span>
          )}
        </div>
      </button>
    </li>
  );
}

function renderHighlightedSnippet(
  snippet: string,
  matches: Array<{start: number; end: number}>
) {
  if (!matches || matches.length === 0) {
    return snippet;
  }
  const parts: Array<{text: string; match: boolean}> = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      parts.push({text: snippet.slice(cursor, m.start), match: false});
    }
    parts.push({text: snippet.slice(m.start, m.end), match: true});
    cursor = m.end;
  }
  if (cursor < snippet.length) {
    parts.push({text: snippet.slice(cursor), match: false});
  }
  return parts.map((p, i) =>
    p.match ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>
  );
}

/**
 * Jumps to a search result. For regular fields this scrolls to the field via
 * the deeplink mechanism that the preview iframe already uses. For matches
 * inside a rich text custom block or inline component, the rich text field is
 * highlighted and the corresponding edit modal is opened on top of it.
 */
function jumpToSearchResult(result: DocSearchResult) {
  // Reuse the existing `scrollToDeeplink` postMessage handler in the
  // DeeplinkProvider — this updates the URL, sets the deeplink state, opens
  // ancestor `<details>` elements, and scrolls into view.
  window.postMessage({scrollToDeeplink: {deepKey: result.deepKey}}, '*');
  // For rich text block matches, dispatch an event for the LexicalEditor to
  // open the block component's modal once the field is in view.
  if (result.richTextBlock) {
    const detail: OpenRichTextBlockEventDetail = result.richTextBlock;
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_RICHTEXT_BLOCK_EVENT, {detail})
      );
    }, 350);
  } else if (result.richTextInline) {
    const detail: OpenRichTextInlineEventDetail = result.richTextInline;
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_RICHTEXT_INLINE_EVENT, {detail})
      );
    }, 350);
  }
}
