import {
  IconAlignLeft,
  IconCornerDownLeft,
  IconDatabase,
  IconFile,
  IconFolder,
  IconRocket,
} from '@tabler/icons-preact';
import {ComponentChild} from 'preact';
import {useEffect, useRef} from 'preact/hooks';
import {joinClassNames} from '../../../utils/classes.js';
import type {RecentView, RecentViewKind} from '../recent-views.js';
import type {DocSlugHit, GlobalSearchHit} from '../useGlobalSearch.js';
import {buildSnippet} from './snippet.js';

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
  CollectionTargetMeta | DataSourceTargetMeta | ReleaseTargetMeta;

/**
 * Discriminated payload attached to each result, which `GlobalSearchAction`
 * renders as the appropriate row.
 */
export type GlobalSearchActionMeta =
  | {kind: 'field'; hit: GlobalSearchHit}
  | {kind: 'doc'; hit: DocSlugHit}
  | {kind: 'target'; target: StaticTargetMeta}
  | {kind: 'recent'; view: RecentView};

function kindIcon(kind: RecentViewKind): ComponentChild {
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

function kindLabel(kind: RecentViewKind): string {
  if (kind === 'collection') return 'Collection';
  if (kind === 'data-source') return 'Data source';
  if (kind === 'release') return 'Release';
  return 'Doc';
}

/** One result in the global search list. */
export interface GlobalSearchItem {
  /** Unique id, also used for the option's DOM id. */
  id: string;
  /** The heading the result is listed under. */
  group: string;
  meta: GlobalSearchActionMeta;
  /** Opens the result. */
  onTrigger: () => void;
}

export interface GlobalSearchActionProps {
  item: GlobalSearchItem;
  /** The option's DOM id, for `aria-activedescendant`. */
  id: string;
  /** Whether the option is the active (keyboard-highlighted) one. */
  active: boolean;
  onTrigger: () => void;
  /** Called when the pointer moves onto the option. */
  onHover: () => void;
}

interface RowProps {
  id: string;
  hovered: boolean;
  onTrigger: () => void;
  onHover: () => void;
  icon: ComponentChild;
  title: ComponentChild;
  /** Secondary line shown below the title. */
  subtitle?: ComponentChild;
  /** Muted label shown on the right, e.g. the result type. */
  kind?: string;
  /** Top-aligns the icon for rows with multi-line content. */
  multiline?: boolean;
}

/**
 * A selectable result row: an icon tile, a title and an optional subtitle.
 * Every result type shares this layout so the list reads as one surface.
 */
function Row(props: RowProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the keyboard-selected row visible now that long result lists
  // scroll. `nearest` makes this a no-op for rows already in view (e.g.
  // ones hovered with the mouse).
  useEffect(() => {
    if (props.hovered) {
      ref.current?.scrollIntoView?.({block: 'nearest'});
    }
  }, [props.hovered]);
  return (
    <div
      ref={ref}
      id={props.id}
      role="option"
      aria-selected={props.hovered}
      className={joinClassNames(
        'GlobalSearchAction',
        props.multiline && 'GlobalSearchAction--multiline',
        props.hovered && 'GlobalSearchAction--hovered'
      )}
      onMouseDown={(e) => {
        // Keep focus in the search input.
        e.preventDefault();
      }}
      onClick={() => props.onTrigger()}
      onPointerMove={() => {
        if (!props.hovered) {
          props.onHover();
        }
      }}
    >
      <div className="GlobalSearchAction__icon">{props.icon}</div>
      <div className="GlobalSearchAction__body">
        <div className="GlobalSearchAction__title">{props.title}</div>
        {props.subtitle && (
          <div className="GlobalSearchAction__subtitle">{props.subtitle}</div>
        )}
      </div>
      {props.hovered ? (
        <div className="GlobalSearchAction__enter">
          Open <IconCornerDownLeft size={13} />
        </div>
      ) : (
        props.kind && (
          <div className="GlobalSearchAction__kind">{props.kind}</div>
        )
      )}
    </div>
  );
}

/** Renders a result as an option row, according to its kind. */
export function GlobalSearchAction(props: GlobalSearchActionProps) {
  const meta = props.item.meta;
  const rowProps = {
    id: props.id,
    hovered: props.active,
    onTrigger: props.onTrigger,
    onHover: props.onHover,
  };

  if (meta.kind === 'field') {
    const hit = meta.hit;
    const segments = buildSnippet(hit);
    return (
      <Row
        {...rowProps}
        multiline
        icon={<IconAlignLeft size={16} />}
        title={
          <>
            {hit.docId}
            <span className="GlobalSearchAction__field">
              {' '}
              · {hit.fieldLabel}
            </span>
          </>
        }
        subtitle={
          <div className="GlobalSearchAction__snippet">
            {segments.map((seg, i) =>
              seg.kind === 'mark' ? (
                <mark key={i} className="GlobalSearchAction__mark">
                  {seg.value}
                </mark>
              ) : (
                <span key={i}>{seg.value}</span>
              )
            )}
          </div>
        }
      />
    );
  }

  if (meta.kind === 'doc') {
    const hit = meta.hit;
    return (
      <Row
        {...rowProps}
        icon={<IconFile size={16} />}
        title={hit.slug}
        subtitle={hit.collection}
      />
    );
  }

  if (meta.kind === 'target') {
    const t = meta.target;
    return (
      <Row
        {...rowProps}
        icon={kindIcon(t.kind)}
        title={t.label}
        subtitle={t.description}
        kind={kindLabel(t.kind)}
      />
    );
  }

  if (meta.kind === 'recent') {
    const view = meta.view;
    return (
      <Row
        {...rowProps}
        icon={kindIcon(view.kind)}
        title={view.label}
        subtitle={view.description}
        kind={kindLabel(view.kind)}
      />
    );
  }

  return null;
}
