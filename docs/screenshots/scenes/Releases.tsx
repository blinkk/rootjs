import {IconPlus} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {Avatar, Badge, CmsFrame} from '../ui/cms.js';
import type {BadgeVariant} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-releases',
  width: 960,
  height: 600,
  alt: 'The Releases page in the Root.js CMS, listing scheduled, published and archived releases that bundle docs and data sources.',
};

const RELEASES: Array<{
  id: string;
  description: string;
  docs: number;
  data: number;
  owner: string;
  status: [BadgeVariant, string];
  when: string;
}> = [
  {
    id: 'spring-harvest-2027',
    description: 'Spring harvest launch',
    docs: 14,
    data: 1,
    owner: 'Ada',
    status: ['scheduled', 'Scheduled'],
    when: 'Mar 3, 7:00 AM',
  },
  {
    id: 'seed-catalog',
    description: 'Seed catalog + growing guides',
    docs: 6,
    data: 2,
    owner: 'Kenji',
    status: ['scheduled', 'Scheduled'],
    when: 'Mar 10, 6:00 AM',
  },
  {
    id: 'growing-guides-de',
    description: 'German growing guides',
    docs: 22,
    data: 0,
    owner: 'Lea',
    status: ['draft', 'Draft'],
    when: '—',
  },
  {
    id: 'winter-roots-sale',
    description: 'Winter root cellar sale',
    docs: 9,
    data: 1,
    owner: 'Priya',
    status: ['published', 'Published'],
    when: 'Jan 12, 8:00 AM',
  },
  {
    id: 'holiday-baskets',
    description: 'Holiday harvest baskets',
    docs: 11,
    data: 0,
    owner: 'Sam',
    status: ['published', 'Published'],
    when: 'Nov 28, 7:00 AM',
  },
  {
    id: 'fall-harvest-2026',
    description: 'Fall harvest launch',
    docs: 16,
    data: 1,
    owner: 'Ada',
    status: ['archived', 'Archived'],
    when: 'Sep 2, 9:00 AM',
  },
];

/** The releases list page. */
export default function Releases() {
  return (
    <CmsFrame active="releases">
      <div style={{padding: '24px 28px', fontSize: '12.5px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
          <h1 className="cms-h1">Releases</h1>
          <span
            className="cms-button cms-button--dark"
            style={{marginLeft: 'auto'}}
          >
            <IconPlus />
            New release
          </span>
        </div>
        <p className="cms-muted" style={{margin: '6px 0 18px'}}>
          Bundle docs and data sources, then publish them together — now or on a
          schedule.
        </p>
        <div style={{display: 'flex', gap: '6px', marginBottom: '14px'}}>
          {['All', 'Scheduled', 'Draft', 'Published', 'Archived'].map(
            (f, i) => (
              <span
                className={`cms-button ${i === 0 ? 'cms-button--active' : ''}`}
              >
                {f}
              </span>
            )
          )}
        </div>
        <table className="cms-table">
          <thead>
            <tr>
              <th>Release</th>
              <th>Content</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Publish time</th>
            </tr>
          </thead>
          <tbody>
            {RELEASES.map((r) => (
              <tr>
                <td>
                  <div
                    className="cms-mono"
                    style={{fontWeight: 500, fontSize: '12px'}}
                  >
                    {r.id}
                  </div>
                  <div className="cms-muted" style={{marginTop: '2px'}}>
                    {r.description}
                  </div>
                </td>
                <td>
                  {r.docs} docs
                  {r.data > 0 && (
                    <span className="cms-muted">
                      {` · ${r.data} data source${r.data > 1 ? 's' : ''}`}
                    </span>
                  )}
                </td>
                <td>
                  <span
                    style={{display: 'flex', alignItems: 'center', gap: '6px'}}
                  >
                    <Avatar name={r.owner} />
                    {r.owner}
                  </span>
                </td>
                <td>
                  <Badge variant={r.status[0]}>{r.status[1]}</Badge>
                </td>
                <td className="cms-muted">{r.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CmsFrame>
  );
}
