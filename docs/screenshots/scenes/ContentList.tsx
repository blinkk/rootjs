import {
  IconBaselineDensitySmall,
  IconChevronDown,
  IconCirclePlus,
  IconDots,
  IconFolder,
} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {Avatar, Badge, CmsFrame} from '../ui/cms.js';
import type {BadgeVariant} from '../ui/cms.js';
import {GardenScene, VEGGIE_TINTS, Veggie} from '../ui/garden.js';
import type {VeggieKind} from '../ui/garden.js';

export const meta: SceneMeta = {
  id: 'cms-content-list',
  width: 960,
  height: 600,
  alt: 'The Content page in the Root.js CMS, with the site’s collections on the left and the docs in the Pages collection listed with thumbnails, titles, publishing status, and who last edited them.',
};

const COLLECTIONS: Array<{name: string; description: string}> = [
  {name: 'Pages', description: 'Site landing pages'},
  {name: 'Recipes', description: 'Seasonal recipes'},
  {name: 'Growing Guides', description: 'Tips for home growers'},
  {name: 'Products', description: 'Produce and seeds'},
  {name: 'Events', description: 'Market days'},
  {name: 'Global Modules', description: 'Headers and footers'},
];

const DOCS: Array<{
  slug: string;
  title: string;
  /** Thumbnail art: the garden hero or a vegetable tile. */
  thumb: VeggieKind | 'garden';
  status: Array<[BadgeVariant, string]>;
  by: string;
  when: string;
}> = [
  {
    slug: 'spring-harvest',
    title: 'Dig into the spring harvest',
    thumb: 'garden',
    status: [
      ['draft', 'Draft'],
      ['scheduled', 'Scheduled'],
    ],
    by: 'Ada',
    when: '2 minutes ago',
  },
  {
    slug: 'index',
    title: 'Fresh from the garden',
    thumb: 'carrot',
    status: [['published', 'Published']],
    by: 'Kenji',
    when: '1 hour ago',
  },
  {
    slug: 'seed-swap',
    title: 'Spring seed swap',
    thumb: 'turnip',
    status: [['draft', 'Draft']],
    by: 'Priya',
    when: '3 hours ago',
  },
  {
    slug: 'garden-center',
    title: 'Visit the garden center',
    thumb: 'radish',
    status: [
      ['draft', 'Draft'],
      ['published', 'Published'],
    ],
    by: 'Sam',
    when: 'yesterday',
  },
  {
    slug: 'harvest-boxes',
    title: 'Weekly harvest boxes',
    thumb: 'beet',
    status: [['published', 'Published']],
    by: 'Lea',
    when: '3 days ago',
  },
  {
    slug: 'our-growers',
    title: 'Meet the growers down the road',
    thumb: 'parsnip',
    status: [['published', 'Published']],
    by: 'Priya',
    when: '5 days ago',
  },
  {
    slug: 'winter-sale',
    title: 'Winter root cellar sale',
    thumb: 'sweetPotato',
    status: [['published', 'Published']],
    by: 'Sam',
    when: 'Feb 9, 2027',
  },
  {
    slug: 'workshops',
    title: 'Spring planting workshops',
    thumb: 'carrot',
    status: [['published', 'Published']],
    by: 'Kenji',
    when: 'Jan 28, 2027',
  },
];

const ROW_COLUMNS = '56px minmax(0, 1fr) 146px 124px 16px';

/** A small doc preview image, like the collection's `preview.image`. */
function Thumb(props: {kind: VeggieKind | 'garden'}) {
  const style = {
    width: '56px',
    height: '42px',
    borderRadius: '4px',
    border: '1px solid var(--cms-border)',
    overflow: 'hidden',
  };
  if (props.kind === 'garden') {
    return <GardenScene style={{...style, display: 'block'}} />;
  }
  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: VEGGIE_TINTS[props.kind],
      }}
    >
      <Veggie kind={props.kind} size={30} />
    </div>
  );
}

/** The Content page, showing the docs in the "Pages" collection. */
export default function ContentList() {
  return (
    <CmsFrame active="content">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '200px 1fr',
          gap: '20px',
          height: '100%',
          padding: '20px 20px 0',
        }}
      >
        <aside style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
          {COLLECTIONS.map((c, i) => (
            <div
              className="cms-panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 10px',
                borderColor: i === 0 ? '#222' : undefined,
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'var(--cms-chip)',
                }}
              >
                <IconFolder size={16} stroke={1.75} />
              </span>
              <span style={{minWidth: 0}}>
                <div style={{fontSize: '13px', fontWeight: 500}}>{c.name}</div>
                <div
                  className="cms-muted"
                  style={{
                    fontSize: '11px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.description}
                </div>
              </span>
            </div>
          ))}
        </aside>
        <section style={{minWidth: 0}}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginBottom: '12px',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: '22px',
                fontWeight: 600,
                letterSpacing: '-0.2px',
              }}
            >
              Pages
            </div>
            <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
              Show archived:
              <span
                style={{
                  width: '26px',
                  height: '14px',
                  borderRadius: '7px',
                  background: '#e9ecef',
                  border: '1px solid #dee2e6',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: '1px',
                    left: '1px',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  }}
                />
              </span>
            </span>
            <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
              Sort:
              <span
                className="cms-input"
                style={{
                  minHeight: '28px',
                  padding: '0 8px',
                  gap: '18px',
                  fontSize: '12px',
                  fontWeight: 400,
                }}
              >
                Last modified
                <IconChevronDown size={13} color="#868e96" />
              </span>
            </span>
            <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
              View:
              <span
                className="cms-button"
                style={{width: '28px', padding: 0, justifyContent: 'center'}}
              >
                <IconBaselineDensitySmall />
              </span>
            </span>
            <span className="cms-button cms-button--dark">
              <IconCirclePlus />
              New
            </span>
          </div>
          <div className="cms-panel" style={{overflow: 'hidden'}}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: ROW_COLUMNS,
                gap: '14px',
                padding: '9px 12px',
                borderBottom: '1px solid var(--cms-border)',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: '#ababab',
              }}
            >
              <span />
              <span>Title</span>
              <span>Status</span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  color: 'var(--cms-text)',
                }}
              >
                Modified
                <IconChevronDown size={11} stroke={2.5} />
              </span>
              <span />
            </div>
            {DOCS.map((doc, i) => (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: ROW_COLUMNS,
                  alignItems: 'center',
                  gap: '14px',
                  padding: '6px 12px',
                  borderTop: i === 0 ? 'none' : '1px solid #f1f3f5',
                  background: i === 0 ? '#f8f9fa' : undefined,
                  fontSize: '12.5px',
                }}
              >
                <Thumb kind={doc.thumb} />
                <span style={{minWidth: 0}}>
                  <div
                    style={{
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {doc.title}
                  </div>
                  <div
                    className="cms-muted"
                    style={{fontSize: '11.5px', marginTop: '2px'}}
                  >
                    {doc.slug}
                  </div>
                </span>
                <span style={{display: 'flex', gap: '4px'}}>
                  {doc.status.map(([variant, label]) => (
                    <Badge variant={variant}>{label}</Badge>
                  ))}
                </span>
                <span
                  className="cms-muted"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Avatar name={doc.by} />
                  {doc.when}
                </span>
                <IconDots size={16} color="#868e96" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </CmsFrame>
  );
}
