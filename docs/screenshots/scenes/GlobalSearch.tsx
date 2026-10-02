import {
  IconAlignLeft,
  IconCornerDownLeft,
  IconDatabase,
  IconFile,
  IconLink,
  IconSearch,
} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import type {SceneMeta} from '../types.js';
import ContentList from './ContentList.js';

export const meta: SceneMeta = {
  id: 'cms-global-search',
  width: 960,
  height: 600,
  alt: 'The Root.js CMS ⌘K global search open over the Content page, with results for “carrot” across a data source, docs, and matching text inside doc fields.',
};

const QUERY = 'carrot';

const FILTERS: Array<[string, number]> = [
  ['All', 6],
  ['Documents', 2],
  ['Field matches', 3],
  ['Collections', 0],
  ['Data sources', 1],
  ['Releases', 0],
];

const DOC_HITS = [
  {slug: 'roasted-carrot-salad', collection: 'Recipes'},
  {slug: 'carrots', collection: 'GrowingGuides'},
];

/**
 * Field hits. Each snippet is split on `*` so the odd segments render as
 * highlighted matches.
 */
const FIELD_HITS = [
  {
    docId: 'Pages/spring-harvest',
    field: 'Body',
    snippet:
      'Heirloom *carrots*, candy-striped beets and peppery radishes, pulled this morning by growers just down the road.',
  },
  {
    docId: 'Products/heirloom-carrots',
    field: 'Description',
    snippet:
      'A rainbow bunch of Purple Haze, Nantes and Yellowstone *carrots*, sweetest after a frost.',
  },
  {
    docId: 'GrowingGuides/carrots',
    field: 'Soil prep',
    snippet:
      'Loosen the bed a full 12 inches deep so *carrot* roots grow long and straight.',
  },
];

/** Keyboard and search syntax hints shown in the footer. */
const HINTS: Array<[string, string]> = [
  ['↑↓', 'navigate'],
  ['↵', 'open'],
  ['"…"', 'exact phrase'],
  ['-word', 'exclude'],
  ['coll/slug', 'jump to doc'],
];

const TEXT = '#333';
const MUTED = '#6b7280';
const FAINT = '#9ca3af';
const BORDER = '#e4e4e1';
const ACCENT = '#d9a6c8';

/** A small key cap, used for the `esc` and footer hints. */
function Kbd(props: {children: string}) {
  return (
    <kbd
      className="cms-mono"
      style={{
        padding: '1px 5px',
        borderRadius: '4px',
        background: '#efefef',
        color: TEXT,
        fontSize: '10px',
        fontWeight: 600,
      }}
    >
      {props.children}
    </kbd>
  );
}

/** A group header in the results list. */
function Header(props: {children: string}) {
  return (
    <div
      style={{
        padding: '12px 16px 4px',
        fontSize: '10.5px',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: MUTED,
      }}
    >
      {props.children}
    </div>
  );
}

/**
 * A result row: an icon tile, a title and a subtitle, with the result type
 * (or an "Open" hint on the selected row) on the right.
 */
function Row(props: {
  icon: ComponentChildren;
  title: ComponentChildren;
  sub: ComponentChildren;
  kind?: string;
  selected?: boolean;
  multiline?: boolean;
}) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: props.multiline ? 'flex-start' : 'center',
        gap: '12px',
        padding: '7px 16px',
        background: props.selected ? '#f6f6f3' : undefined,
        boxShadow: props.selected ? `inset 3px 0 0 ${ACCENT}` : undefined,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 30px',
          height: '30px',
          border: `1px solid ${BORDER}`,
          borderRadius: '6px',
          background: '#fff',
          color: TEXT,
        }}
      >
        {props.icon}
      </span>
      <span style={{flex: 1, minWidth: 0}}>
        <div style={{fontSize: '13px', fontWeight: 600, color: TEXT}}>
          {props.title}
        </div>
        <div style={{fontSize: '12px', color: MUTED}}>{props.sub}</div>
      </span>
      {props.selected ? (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'center',
            gap: '4px',
            fontSize: '11.5px',
            color: MUTED,
          }}
        >
          Open <IconCornerDownLeft size={13} />
        </span>
      ) : (
        props.kind && (
          <span style={{alignSelf: 'center', fontSize: '11.5px', color: FAINT}}>
            {props.kind}
          </span>
        )
      )}
    </div>
  );
}

/** Renders a snippet, highlighting the segments wrapped in `*`. */
function Snippet(props: {text: string}) {
  return (
    <div
      style={{
        marginTop: '2px',
        fontSize: '12.5px',
        lineHeight: 1.45,
        color: '#4b5058',
      }}
    >
      {props.text.split('*').map((part, i) =>
        i % 2 ? (
          <mark
            style={{
              padding: '0 2px',
              borderRadius: '3px',
              background: '#f6e3ef',
              color: TEXT,
              fontWeight: 600,
            }}
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </div>
  );
}

/** The ⌘K global search spotlight, open over the Content page. */
export default function GlobalSearch() {
  return (
    <div style={{position: 'relative', width: '100%', height: '100%'}}>
      <div style={{width: '100%', height: '100%', filter: 'blur(2px)'}}>
        <ContentList />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          paddingTop: '36px',
          background: 'rgba(0, 0, 0, 0.28)',
        }}
      >
        <div
          className="cms-modal"
          style={{width: '640px', overflow: 'hidden', fontSize: '13px'}}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              height: '52px',
              padding: '0 16px',
              fontSize: '15px',
            }}
          >
            <IconSearch size={18} color={MUTED} />
            <span>
              {QUERY}
              <span
                style={{
                  display: 'inline-block',
                  width: '1.5px',
                  height: '18px',
                  marginLeft: '1px',
                  verticalAlign: '-3px',
                  background: TEXT,
                }}
              />
            </span>
            <span style={{marginLeft: 'auto'}}>
              <Kbd>esc</Kbd>
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: '18px',
              height: '38px',
              padding: '0 16px',
              borderTop: `1px solid ${BORDER}`,
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            {FILTERS.map(([label, count], i) => (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: i === 0 ? 600 : 500,
                  color: i === 0 ? TEXT : count ? MUTED : '#b4b4ae',
                  whiteSpace: 'nowrap',
                  boxShadow: i === 0 ? `inset 0 -2px 0 ${ACCENT}` : undefined,
                }}
              >
                {label}
                {count > 0 && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: i === 0 ? MUTED : FAINT,
                    }}
                  >
                    {count}
                  </span>
                )}
              </span>
            ))}
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                marginLeft: 'auto',
                color: MUTED,
              }}
            >
              <IconLink size={14} />
            </span>
          </div>
          <div style={{paddingBottom: '6px'}}>
            <Header>Jump to</Header>
            <Row
              icon={<IconDatabase size={16} />}
              title="carrot-varieties"
              sub="Heirloom carrot varieties from the growers’ sheet"
              kind="Data source"
              selected
            />
            <Header>Documents</Header>
            {DOC_HITS.map((hit) => (
              <Row
                icon={<IconFile size={16} />}
                title={hit.slug}
                sub={hit.collection}
              />
            ))}
            <Header>Field matches</Header>
            {FIELD_HITS.slice(0, 2).map((hit) => (
              <Row
                icon={<IconAlignLeft size={16} />}
                title={
                  <>
                    {hit.docId}
                    <span style={{fontWeight: 400, color: MUTED}}>
                      {' '}
                      · {hit.field}
                    </span>
                  </>
                }
                sub={<Snippet text={hit.snippet} />}
                multiline
              />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              height: '34px',
              padding: '0 16px',
              borderTop: `1px solid ${BORDER}`,
              background: '#fbfbf9',
              fontSize: '11px',
              color: MUTED,
              whiteSpace: 'nowrap',
            }}
          >
            {HINTS.map(([key, label]) => (
              <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                <Kbd>{key}</Kbd>
                {label}
              </span>
            ))}
            <span style={{marginLeft: 'auto', color: FAINT}}>
              Indexed 4m ago
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
