import {IconDatabase, IconPlus} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {Avatar, Badge, CmsFrame} from '../ui/cms.js';
import type {BadgeVariant} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-releases',
  width: 960,
  height: 600,
  alt: 'The Releases page in the Root.js CMS, listing scheduled, unpublished and published releases that bundle docs and data sources, with who last acted on each and when.',
};

const RELEASES_CSS = `
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
.rl__id { color: #1f1f1f; font-size: 13px; font-weight: 600; white-space: nowrap; }
.rl__description { margin-top: 2px; color: #646b77; font-size: 12px; }
.rl__chips { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; }
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
.rl__activity { display: flex; align-items: center; gap: 8px; }
.rl__activityUser { font-weight: 500; }
.rl__activityAction { color: #646b77; font-size: 11px; white-space: nowrap; }
`;

/** How many chips show before the rest collapse into "+N more". */
const CHIP_LIMIT = 6;

const RELEASES: Array<{
  id: string;
  description: string;
  dataSources: string[];
  docs: string[];
  status: [BadgeVariant, string];
  /** The most recent action taken on the release. */
  activity: {by: string; label: string};
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
    ],
    status: ['scheduled', 'Scheduled'],
    activity: {by: 'Ada', label: 'Scheduled for Mar 3, 2027, 7:00 AM'},
  },
  {
    id: 'seed-catalog',
    description: 'Seed catalog and growing guides',
    dataSources: ['seed-inventory'],
    docs: ['Products/seeds', 'GrowingGuides/sowing-carrots'],
    status: ['scheduled', 'Scheduled'],
    activity: {by: 'Kenji', label: 'Scheduled for Mar 9, 2027, 9:00 AM'},
  },
  {
    id: 'growing-guides-de',
    description: 'German growing guides',
    dataSources: [],
    docs: ['GrowingGuides/sowing-carrots', 'GrowingGuides/storing-beets'],
    status: ['draft', 'Unpublished'],
    activity: {by: 'Lea', label: 'Created · 3 days ago'},
  },
  {
    id: 'winter-roots-sale',
    description: 'Winter root cellar sale',
    dataSources: ['farm-stand-prices'],
    docs: ['Pages/winter-sale'],
    status: ['published', 'Published'],
    activity: {by: 'Priya', label: 'Published · Feb 11, 2027'},
  },
];

/** A release's data sources and docs as chips, one per line. */
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
    ['Active', 4],
    ['Unpublished', 3],
    ['Published', 1],
    ['Archived', 4],
  ];
  return (
    <CmsFrame active="releases">
      <style>{RELEASES_CSS}</style>
      <div style={{padding: '22px 28px', fontSize: '12.5px'}}>
        <h1 className="cms-h1">Releases</h1>
        <p className="cms-muted" style={{margin: '6px 0 16px'}}>
          Bundle one or more documents and publish them together. Schedule a
          release to go live at a specific time, or publish manually when you're
          ready.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <div className="cms-segmented">
            {filters.map(([label, count], i) => (
              <span className={i === 0 ? 'active' : ''}>
                {label}
                <span className="cms-segmented__count">{count}</span>
              </span>
            ))}
          </div>
          <span
            className="cms-button cms-button--dark"
            style={{marginLeft: 'auto'}}
          >
            <IconPlus />
            New release
          </span>
        </div>
        <div className="rl__surface">
          <table className="rl__table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Release</th>
                <th>Contents</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {RELEASES.map((r) => (
                <tr>
                  <td style={{width: 0}}>
                    <Badge variant={r.status[0]}>{r.status[1]}</Badge>
                  </td>
                  <td>
                    <div className="rl__id">{r.id}</div>
                    <div className="rl__description">{r.description}</div>
                  </td>
                  <td>
                    <Contents dataSources={r.dataSources} docs={r.docs} />
                  </td>
                  <td>
                    <div className="rl__activity">
                      <Avatar name={r.activity.by} large />
                      <div>
                        <div className="rl__activityUser">{r.activity.by}</div>
                        <div className="rl__activityAction">
                          {r.activity.label}
                        </div>
                      </div>
                    </div>
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
