import {
  IconChevronRight,
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
  alt: 'The Root.js CMS ⌘K global search open over the Content page, with results for “carrot” across a data source, docs and matching text inside doc fields.',
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
  {slug: 'roasted-carrot-salad', docId: 'Recipes/roasted-carrot-salad'},
  {slug: 'carrots', docId: 'GrowingGuides/carrots'},
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

/** Search syntax tips shown below the results. */
const TIPS: Array<[string, string]> = [
  ['"…"', 'exact phrase'],
  ['-word', 'exclude'],
  ['coll/slug', 'jump by id'],
];

const MUTED = '#868e96';

/** A section header in the results list. */
function Header(props: {children: string}) {
  return (
    <div
      style={{
        padding: '10px 16px 4px',
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

/** A result row with an icon, title and a tagged subtitle. */
function Row(props: {
  icon: ComponentChildren;
  title: string;
  tag: string;
  sub: string;
  hovered?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        background: props.hovered ? '#f1f3f5' : undefined,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 28px',
          height: '28px',
          borderRadius: '6px',
          background: '#e9ecef',
          color: '#343a40',
        }}
      >
        {props.icon}
      </span>
      <span style={{minWidth: 0}}>
        <div style={{fontSize: '13px', fontWeight: 600, color: '#25262b'}}>
          {props.title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '2px',
            fontSize: '11.5px',
            color: MUTED,
          }}
        >
          <span
            style={{
              padding: '1px 6px',
              borderRadius: '4px',
              background: '#e9ecef',
              color: '#495057',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {props.tag}
          </span>
          {props.sub}
        </div>
      </span>
    </div>
  );
}

/** Renders a snippet, highlighting the segments wrapped in `*`. */
function Snippet(props: {text: string}) {
  return (
    <div style={{fontSize: '13px', lineHeight: 1.45, color: '#343a40'}}>
      {props.text.split('*').map((part, i) =>
        i % 2 ? (
          <mark
            style={{
              background: '#fff3bf',
              color: 'inherit',
              padding: '0 2px',
              borderRadius: '2px',
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
              height: '50px',
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
                  background: '#228be6',
                }}
              />
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderTop: '1px solid #e9ecef',
              borderBottom: '1px solid #e9ecef',
            }}
          >
            {FILTERS.map(([label, count], i) => (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  border: `1px solid ${i === 0 ? '#343a40' : '#dee2e6'}`,
                  background: i === 0 ? '#343a40' : '#fff',
                  color: i === 0 ? '#fff' : count ? '#343a40' : MUTED,
                  fontSize: '11px',
                  fontWeight: 500,
                  lineHeight: 1.4,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
                {count > 0 && (
                  <span
                    style={{
                      padding: '0 5px',
                      borderRadius: '999px',
                      background:
                        i === 0 ? 'rgba(255, 255, 255, 0.2)' : '#e9ecef',
                      color: i === 0 ? 'inherit' : '#495057',
                      fontSize: '10.5px',
                      fontWeight: 600,
                    }}
                  >
                    {count}
                  </span>
                )}
              </span>
            ))}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginLeft: 'auto',
                color: MUTED,
                fontSize: '11px',
                whiteSpace: 'nowrap',
              }}
            >
              <IconLink size={13} />
              Copy link
            </span>
          </div>
          <div style={{paddingBottom: '2px'}}>
            <Header>Jump to</Header>
            <Row
              icon={<IconDatabase size={16} />}
              title="carrot-varieties"
              tag="Data source"
              sub="Heirloom carrot varieties from the growers’ sheet"
              hovered
            />
            <Header>Documents</Header>
            {DOC_HITS.map((hit) => (
              <Row
                icon={<IconFile size={16} />}
                title={hit.slug}
                tag="Doc"
                sub={hit.docId}
              />
            ))}
            <Header>Field matches</Header>
            {FIELD_HITS.map((hit) => (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  padding: '8px 16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11.5px',
                    color: MUTED,
                  }}
                >
                  <span style={{fontWeight: 600, color: '#25262b'}}>
                    {hit.docId}
                  </span>
                  <IconChevronRight size={14} />
                  <span style={{fontStyle: 'italic', color: '#495057'}}>
                    {hit.field}
                  </span>
                </div>
                <Snippet text={hit.snippet} />
              </div>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderTop: '1px solid #e9ecef',
              background: '#f8f9fa',
              fontSize: '11px',
              color: MUTED,
            }}
          >
            {TIPS.map(([key, label], i) => (
              <>
                {i > 0 && <span style={{color: '#ced4da'}}>·</span>}
                <span
                  style={{display: 'flex', alignItems: 'center', gap: '4px'}}
                >
                  <kbd
                    className="cms-mono"
                    style={{
                      padding: '0 5px',
                      borderRadius: '3px',
                      border: '1px solid #dee2e6',
                      borderBottomWidth: '2px',
                      background: '#e9ecef',
                      color: '#343a40',
                      fontSize: '10.5px',
                    }}
                  >
                    {key}
                  </kbd>
                  {label}
                </span>
              </>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
