import {SpotlightActionProps} from '@mantine/spotlight';
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
import type {DocSlugHit, GlobalSearchHit} from '../../hooks/useGlobalSearch.js';
import {joinClassNames} from '../../utils/classes.js';
import type {RecentView, RecentViewKind} from '../../utils/recent-views.js';
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
 * Discriminated payload attached to each SpotlightAction. The Mantine
 * SpotlightAction type is open-ended, so we stash everything we need on a
 * single `meta` field and let this component render the appropriate row.
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

interface RowProps {
  hovered: boolean;
  onTrigger: () => void;
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
  const ref = useRef<HTMLButtonElement>(null);
  // Keep the keyboard-selected row visible now that long result lists
  // scroll. `nearest` makes this a no-op for rows already in view (e.g.
  // ones hovered with the mouse).
  useEffect(() => {
    if (props.hovered) {
      ref.current?.scrollIntoView?.({block: 'nearest'});
    }
  }, [props.hovered]);
  return (
    <button
      ref={ref}
      type="button"
      className={joinClassNames(
        'GlobalSearchAction',
        props.multiline && 'GlobalSearchAction--multiline',
        props.hovered && 'GlobalSearchAction--hovered'
      )}
      onMouseDown={(e) => {
        // mousedown so the click registers before Spotlight closes the modal.
        e.preventDefault();
        props.onTrigger();
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
    </button>
  );
}

export function GlobalSearchAction(props: SpotlightActionProps) {
  const meta = (props.action as any)?.meta as
    GlobalSearchActionMeta | undefined;
  if (!meta) {
    return null;
  }

  if (meta.kind === 'field') {
    const hit = meta.hit;
    const segments = buildSnippet(hit);
    return (
      <Row
        hovered={props.hovered}
        onTrigger={props.onTrigger}
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
        hovered={props.hovered}
        onTrigger={props.onTrigger}
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
        hovered={props.hovered}
        onTrigger={props.onTrigger}
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
        hovered={props.hovered}
        onTrigger={props.onTrigger}
        icon={kindIcon(view.kind)}
        title={view.label}
        subtitle={view.description}
        kind={kindLabel(view.kind)}
      />
    );
  }

  return null;
}
