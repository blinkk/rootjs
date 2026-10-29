import {IconDatabase, IconPlus} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {Avatar, Badge, CmsFrame} from '../ui/cms.js';
import type {BadgeVariant} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-releases',
  width: 960,
  height: 600,
  alt: 'The Releases page in the Root.js CMS, listing scheduled, unpublished and published releases that bundle docs and data sources.',
};

const RELEASES_CSS = `
.rl__segmented {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--cms-border);
  border-radius: 6px;
  background: #f5f5f3;
  font-size: 12px;
  font-weight: 500;
}
.rl__segmented > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 4px;
  color: #646b77;
}
.rl__segmented > span.active {
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  color: #1f1f1f;
}
.rl__count {
  padding: 0 5px;
  border-radius: 999px;
  background: #ececea;
  color: #646b77;
  font-size: 10px;
  line-height: 14px;
}
.rl__surface {
  overflow: hidden;
  border: 1px solid var(--cms-border);
  border-radius: 10px;
  background: var(--cms-surface);
}
.rl__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.rl__table th {
  padding: 8px 14px;
  border-bottom: 1px solid var(--cms-border);
  background: #f5f5f3;
  color: #646b77;
  font-weight: 500;
  text-align: left;
}
.rl__table td {
  padding: 10px 14px;
  border-bottom: 1px solid #ececea;
  vertical-align: top;
}
.rl__table tr:last-child td { border-bottom: none; }
.rl__title { color: #1f1f1f; font-size: 13px; font-weight: 600; }
.rl__id { margin-top: 2px; color: #646b77; font-family: var(--cms-font-mono); font-size: 11px; }
.rl__chips { display: flex; flex-wrap: wrap; gap: 4px; max-width: 340px; }
.rl__chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 7px;
  border-radius: 5px;
  background: #f5f5f3;
  font-family: var(--cms-font-mono);
  font-size: 11px;
  white-space: nowrap;
}
.rl__chip--data { background: #ebfbee; color: #2b7a3b; }
.rl__chip--more {
  border: 1px dashed #cfcfcb;
  background: #fff;
  color: #646b77;
  font-family: var(--cms-font);
  font-weight: 500;
}
.rl__chip svg { width: 11px; height: 11px; }
.rl__owner { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
`;

/** How many chips show before the rest collapse into "+N more". */
const CHIP_LIMIT = 6;

const RELEASES: Array<{
  id: string;
  description: string;
  dataSources: string[];
  docs: string[];
  owner: string;
  status: [BadgeVariant, string];
}> = [
  {
    id: 'spring-harvest-2027',
    description: 'Spring harvest launch',
    dataSources: ['planting-calendar'],
    docs: [
      'Pages/spring-harvest',
      'Pages/index',
      'Products/rainbow-carrots',
      'Products/purple-top-turnips',
      'Recipes/roasted-roots',
      'Recipes/beet-salad',
      'Events/seed-swap',
    ],
    owner: 'Ada',
    status: ['scheduled', 'Scheduled'],
  },
  {
    id: 'seed-catalog',
    description: 'Seed catalog and growing guides',
    dataSources: ['seed-inventory', 'farm-stand-prices'],
    docs: ['Products/seeds', 'GrowingGuides/sowing-carrots'],
    owner: 'Kenji',
    status: ['scheduled', 'Scheduled'],
  },
  {
    id: 'growing-guides-de',
    description: 'German growing guides',
    dataSources: [],
    docs: [
      'GrowingGuides/sowing-carrots',
      'GrowingGuides/storing-beets',
      'GrowingGuides/winter-radishes',
    ],
    owner: 'Lea',
    status: ['draft', 'Unpublished'],
  },
  {
    id: 'winter-roots-sale',
    description: 'Winter root cellar sale',
    dataSources: ['farm-stand-prices'],
    docs: ['Pages/winter-sale', 'Products/storage-beets'],
    owner: 'Priya',
    status: ['published', 'Published'],
  },
  {
    id: 'holiday-baskets',
    description: 'Holiday harvest baskets',
    dataSources: [],
    docs: ['Pages/harvest-boxes'],
    owner: 'Sam',
    status: ['published', 'Published'],
  },
];

/** A release's data sources and docs as chips, as on the real page. */
function Contents(props: {dataSources: string[]; docs: string[]}) {
  const items = [
    ...props.dataSources.map((id) => ({id, data: true})),
    ...props.docs.map((id) => ({id, data: false})),
  ];
  const collapsed = items.length > CHIP_LIMIT;
  const visible = collapsed ? items.slice(0, CHIP_LIMIT - 1) : items;
  return (
    <div className="rl__chips">
      {visible.map((item) => (
        <span className={`rl__chip ${item.data ? 'rl__chip--data' : ''}`}>
          {item.data && <IconDatabase stroke={2} />}
          {item.id}
        </span>
      ))}
      {collapsed && (
        <span className="rl__chip rl__chip--more">
          +{items.length - visible.length} more
        </span>
      )}
    </div>
  );
}

/** The releases list page. */
export default function Releases() {
  const filters: Array<[string, number]> = [
    ['Active', 5],
    ['Unpublished', 1],
    ['Published', 2],
    ['Archived', 4],
  ];
  return (
    <CmsFrame active="releases">
      <style>{RELEASES_CSS}</style>
      <div style={{padding: '24px 28px', fontSize: '12.5px'}}>
        <div style={{display: 'flex', alignItems: 'flex-start', gap: '12px'}}>
          <div>
            <h1 className="cms-h1">Releases</h1>
            <p className="cms-muted" style={{margin: '6px 0 18px'}}>
              Bundle docs and data sources, then publish them together — now or
              on a schedule.
            </p>
          </div>
          <span
            className="cms-button cms-button--dark"
            style={{marginLeft: 'auto'}}
          >
            <IconPlus />
            New release
          </span>
        </div>
        <div className="rl__segmented" style={{marginBottom: '14px'}}>
          {filters.map(([label, count], i) => (
            <span className={i === 0 ? 'active' : ''}>
              {label}
              <span className="rl__count">{count}</span>
            </span>
          ))}
        </div>
        <div className="rl__surface">
          <table className="rl__table">
            <thead>
              <tr>
                <th>Release</th>
                <th>Contents</th>
                <th>Created by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {RELEASES.map((r) => (
                <tr>
                  <td>
                    <div className="rl__title">{r.description}</div>
                    <div className="rl__id">{r.id}</div>
                  </td>
                  <td>
                    <Contents dataSources={r.dataSources} docs={r.docs} />
                  </td>
                  <td>
                    <span className="rl__owner">
                      <Avatar name={r.owner} />
                      {r.owner}
                    </span>
                  </td>
                  <td>
                    <Badge variant={r.status[0]}>{r.status[1]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </CmsFrame>
  );
}
