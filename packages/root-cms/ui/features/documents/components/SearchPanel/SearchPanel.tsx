import {IconSearch, IconX} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {debounce} from '../../../../utils/debounce.js';
import {useCollectionSchema} from '../../../collections/useCollectionSchema.js';
import {
  DocSearchResult,
  OPEN_RICHTEXT_BLOCK_EVENT,
  OPEN_RICHTEXT_INLINE_EVENT,
  OpenRichTextBlockEventDetail,
  OpenRichTextInlineEventDetail,
  searchDocFields,
} from '../../doc-search.js';
import {useDraftDoc, useDraftDocData} from '../../useDraftDoc.js';

const EMPTY_CLASSES =
  'SearchPanel__empty px-3 py-4 text-sm leading-normal text-muted';

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
    <div className="SearchPanel flex h-full flex-col overflow-hidden bg-surface">
      <div className="SearchPanel__header flex h-control-md shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="SearchPanel__header__title text-sm font-semibold">
          Search
        </div>
        {props.onClose && (
          <IconButton size="xs" label="Close search" onClick={props.onClose}>
            <IconX />
          </IconButton>
        )}
      </div>
      <div className="SearchPanel__searchInput shrink-0 border-b border-border px-3 py-2.5">
        <TextInput
          ref={inputRef}
          type="text"
          aria-label="Search field values"
          className="SearchPanel__searchInput__input"
          leftSection={<IconSearch />}
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
      <div className="SearchPanel__body flex-1 overflow-auto py-2">
        {!searched && !query.trim() && (
          <div className={EMPTY_CLASSES}>
            Type a query above to search field values in this document.
          </div>
        )}
        {searched && results.length === 0 && (
          <div className={EMPTY_CLASSES}>
            No matches for <strong>{query}</strong>.
          </div>
        )}
        {results.length > 0 && (
          <>
            <div className="SearchPanel__resultsCount px-3 pb-2 pt-1 text-xs uppercase tracking-wide text-muted">
              {results.length} {results.length === 1 ? 'match' : 'matches'}
            </div>
            <ul className="SearchPanel__results m-0 flex list-none flex-col p-0">
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
    <li className="SearchPanel__result border-b border-border">
      <button
        type="button"
        className="SearchPanel__result__button m-0 block w-full cursor-pointer appearance-none border-0 bg-transparent px-3 py-2.5 text-left font-sans text-sm text-inherit hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        onClick={props.onClick}
      >
        <div className="SearchPanel__result__label mb-1 break-words text-sm font-semibold text-fg">
          {result.label}
        </div>
        <div className="SearchPanel__result__snippet mb-1 break-words text-sm leading-snug text-muted">
          {renderHighlightedSnippet(result.snippet, result.matches)}
        </div>
        <div className="SearchPanel__result__meta flex items-center gap-1.5 text-xs text-muted">
          <span className="SearchPanel__result__type font-semibold uppercase tracking-wide">
            {result.fieldType}
          </span>
          {result.richTextBlock && (
            <Badge className="SearchPanel__result__badge" tone="info" size="xs">
              in block
            </Badge>
          )}
          {result.richTextInline && (
            <Badge className="SearchPanel__result__badge" tone="info" size="xs">
              inline
            </Badge>
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
    p.match ? (
      <mark key={i} className="rounded-sm bg-warning-soft px-px text-inherit">
        {p.text}
      </mark>
    ) : (
      <span key={i}>{p.text}</span>
    )
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
