import {SpotlightActionProps} from '@mantine/spotlight';
import {
  IconChevronRight,
  IconClock,
  IconDatabase,
  IconFile,
  IconFolder,
  IconRocket,
} from '@tabler/icons-preact';
import {ComponentChild} from 'preact';
import type {
  DocSlugHit,
  GlobalSearchHit,
} from '../../hooks/useGlobalSearch.js';
import type {RecentView, RecentViewKind} from '../../utils/recent-views.js';

const SNIPPET_BEFORE = 60;
const SNIPPET_AFTER = 120;

interface CollectionTargetMeta {
  kind: 'collection';
  id: string;
  url: string;
  label: string;
  description?: string;
  haystack: string;
}

interface DataSourceTargetMeta {
  kind: 'data-source';
  id: string;
  url: string;
  label: string;
  description?: string;
  haystack: string;
}

interface ReleaseTargetMeta {
  kind: 'release';
  id: string;
  url: string;
  label: string;
  description?: string;
  haystack: string;
}

type StaticTargetMeta =
  | CollectionTargetMeta
  | DataSourceTargetMeta
  | ReleaseTargetMeta;

/**
 * Discriminated payload attached to each SpotlightAction. The Mantine
 * SpotlightAction type is open-ended, so we stash everything we need on a
 * single `meta` field and let this component render the appropriate row.
 */
export type GlobalSearchActionMeta =
  | {kind: 'field'; hit: GlobalSearchHit}
  | {kind: 'doc'; hit: DocSlugHit}
  | {kind: 'target'; target: StaticTargetMeta}
  | {kind: 'recent'; view: RecentView}
  | {kind: 'header'; label: string}
  | {kind: 'footer'; lastIndexed: string};

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

function targetIcon(kind: StaticTargetMeta['kind']): ComponentChild {
  if (kind === 'collection') {
    return <IconFolder size={16} />;
  }
  if (kind === 'data-source') {
    return <IconDatabase size={16} />;
  }
  return <IconRocket size={16} />;
}

function recentIcon(kind: RecentViewKind): ComponentChild {
  if (kind === 'collection') {
    return <IconFolder size={16} />;
  }
  if (kind === 'data-source') {
    return <IconDatabase size={16} />;
  }
  if (kind === 'release') {
    return <IconRocket size={16} />;
  }
  return <IconFile size={16} />;
}

function targetLabel(kind: StaticTargetMeta['kind']): string {
  if (kind === 'collection') return 'Collection';
  if (kind === 'data-source') return 'Data source';
  return 'Release';
}

function recentKindLabel(kind: RecentViewKind): string {
  if (kind === 'collection') return 'Collection';
  if (kind === 'data-source') return 'Data source';
  if (kind === 'release') return 'Release';
  return 'Doc';
}

interface RowProps {
  hovered: boolean;
  onTrigger: () => void;
  className?: string;
  children: ComponentChild;
}

function Row(props: RowProps) {
  const className = [
    'GlobalSearchAction',
    props.className || '',
    props.hovered ? 'GlobalSearchAction--hovered' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={className}
      onMouseDown={(e) => {
        // mousedown so the click registers before Spotlight closes the modal.
        e.preventDefault();
        props.onTrigger();
      }}
    >
      {props.children}
    </button>
  );
}

export function GlobalSearchAction(props: SpotlightActionProps) {
  const meta = (props.action as any)?.meta as GlobalSearchActionMeta | undefined;
  if (!meta) {
    return null;
  }

  if (meta.kind === 'header') {
    return (
      <div className="GlobalSearchAction GlobalSearchAction--header">
        {meta.label}
      </div>
    );
  }

  if (meta.kind === 'footer') {
    return (
      <div className="GlobalSearchAction GlobalSearchAction--footer">
        Last indexed {meta.lastIndexed}
      </div>
    );
  }

  if (meta.kind === 'field') {
    const hit = meta.hit;
    const snippet = buildSnippet(hit);
    return (
      <Row hovered={props.hovered} onTrigger={props.onTrigger}>
        <div className="GlobalSearchAction__crumbs">
          <span className="GlobalSearchAction__docId">{hit.docId}</span>
          <span className="GlobalSearchAction__sep">
            <IconChevronRight size={16} />
          </span>
          <span className="GlobalSearchAction__field">{hit.fieldLabel}</span>
        </div>
        <div className="GlobalSearchAction__snippet">
          <span>{snippet.pre}</span>
          {snippet.mark && (
            <mark className="GlobalSearchAction__mark">{snippet.mark}</mark>
          )}
          <span>{snippet.post}</span>
        </div>
      </Row>
    );
  }

  if (meta.kind === 'doc') {
    const hit = meta.hit;
    return (
      <Row hovered={props.hovered} onTrigger={props.onTrigger}>
        <div className="GlobalSearchAction__row">
          <div className="GlobalSearchAction__icon">
            <IconFile size={16} />
          </div>
          <div className="GlobalSearchAction__body">
            <div className="GlobalSearchAction__title">{hit.slug}</div>
            <div className="GlobalSearchAction__sub">
              <span className="GlobalSearchAction__tag">Doc</span>
              <span className="GlobalSearchAction__subText">{hit.docId}</span>
            </div>
          </div>
        </div>
      </Row>
    );
  }

  if (meta.kind === 'target') {
    const t = meta.target;
    return (
      <Row hovered={props.hovered} onTrigger={props.onTrigger}>
        <div className="GlobalSearchAction__row">
          <div className="GlobalSearchAction__icon">{targetIcon(t.kind)}</div>
          <div className="GlobalSearchAction__body">
            <div className="GlobalSearchAction__title">{t.label}</div>
            <div className="GlobalSearchAction__sub">
              <span className="GlobalSearchAction__tag">
                {targetLabel(t.kind)}
              </span>
              {t.description && (
                <span className="GlobalSearchAction__subText">
                  {t.description}
                </span>
              )}
            </div>
          </div>
        </div>
      </Row>
    );
  }

  if (meta.kind === 'recent') {
    const view = meta.view;
    return (
      <Row hovered={props.hovered} onTrigger={props.onTrigger}>
        <div className="GlobalSearchAction__row">
          <div className="GlobalSearchAction__icon GlobalSearchAction__icon--muted">
            <IconClock size={16} />
          </div>
          <div className="GlobalSearchAction__body">
            <div className="GlobalSearchAction__title">{view.label}</div>
            <div className="GlobalSearchAction__sub">
              <span className="GlobalSearchAction__tag">
                {recentKindLabel(view.kind)}
              </span>
              <span className="GlobalSearchAction__subIcon">
                {recentIcon(view.kind)}
              </span>
            </div>
          </div>
        </div>
      </Row>
    );
  }

  return null;
}
