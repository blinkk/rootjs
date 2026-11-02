import {
  IconArrowUp,
  IconPlus,
  IconRefresh,
  IconTable,
  IconWorld,
} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {Avatar, CmsFrame} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-data-sources',
  width: 960,
  height: 600,
  alt: 'The Data Sources page in the Root.js CMS, showing Google Sheets and HTTP JSON feeds as cards with their publish status, sync schedule, and when and by whom each was last synced and published.',
};

const DATA_SOURCES_CSS = `
.ds__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.ds__card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--cms-border);
  border-radius: 10px;
  background: var(--cms-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.ds__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}
.ds__header {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}
.ds__icon {
  display: flex;
  flex: 0 0 30px;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: #ececea;
  color: #646b77;
}
.ds__icon--sheet {
  background: #ebfbee;
  color: #2b7a3b;
}
.ds__title {
  flex: 1;
  min-width: 0;
}
.ds__id {
  overflow: hidden;
  color: #1f1f1f;
  font-family: var(--cms-font-mono);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ds__source {
  overflow: hidden;
  margin-top: 1px;
  color: #646b77;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ds__badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}
.ds__badges .cms-badge {
  height: 15px;
  padding: 0 6px;
  font-size: 8.5px;
}
.ds__description {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.35;
}
.ds__stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: auto 0 0;
  padding-top: 8px;
  border-top: 1px solid #ececea;
  font-size: 10.5px;
}
.ds__stat {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.ds__stat dt { color: #646b77; }
.ds__stat dd {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  white-space: nowrap;
}
.ds__stat .cms-avatar {
  width: 14px;
  height: 14px;
  border: 0;
  font-size: 7.5px;
}
.ds__newer {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #a85b00;
}
.ds__newerTime {
  color: #a85b00;
  font-weight: 500;
}
.ds__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid #ececea;
}
.ds__actions .cms-button {
  justify-content: center;
  height: 26px;
  font-size: 11.5px;
}
.ds__actions .cms-button[aria-disabled='true'] { opacity: 0.5; }
`;

interface Activity {
  /** Relative time, or a date when it's more than a week old. */
  at: string;
  /** First name of a fixture user. */
  by: string;
}

/** Fixture data sources, sorted by id like the real page. */
const DATA_SOURCES: Array<{
  id: string;
  description: string;
  type: 'gsheet' | 'http';
  /** "Google Sheet", or the request method and url for HTTP. */
  source: string;
  status: 'published' | 'unpublished';
  /** Whether it was synced after it was last published. */
  hasChanges?: boolean;
  synced: Activity;
  published?: Activity;
  schedule: string;
}> = [
  {
    id: 'csa-box-contents',
    description: 'Weekly CSA box',
    type: 'gsheet',
    source: 'Google Sheet',
    status: 'published',
    synced: {at: '5 days ago', by: 'Lea'},
    published: {at: '5 days ago', by: 'Lea'},
    schedule: 'Manual',
  },
  {
    id: 'farm-stand-prices',
    description: 'Farm stand prices',
    type: 'gsheet',
    source: 'Google Sheet',
    status: 'published',
    hasChanges: true,
    synced: {at: '2 hours ago', by: 'Priya'},
    published: {at: '3 days ago', by: 'Kenji'},
    schedule: 'Every hour',
  },
  {
    id: 'frost-alerts',
    description: 'Frost alerts',
    type: 'http',
    source: 'GET weather.fernwood.example/v1/frost',
    status: 'published',
    synced: {at: 'Feb 11, 2027', by: 'Sam'},
    published: {at: 'Feb 11, 2027', by: 'Sam'},
    schedule: 'Daily at 6:00 AM, auto-publish',
  },
  {
    id: 'market-events',
    description: 'Market events',
    type: 'http',
    source: 'GET events.fernwood.example/feed.json',
    status: 'published',
    synced: {at: '20 minutes ago', by: 'Ada'},
    published: {at: '20 minutes ago', by: 'Ada'},
    schedule: 'Every 6 hours, auto-publish',
  },
  {
    id: 'seed-inventory',
    description: 'Seed inventory',
    type: 'gsheet',
    source: 'Google Sheet',
    status: 'unpublished',
    synced: {at: '4 minutes ago', by: 'Kenji'},
    schedule: 'Manual',
  },
  {
    id: 'store-hours',
    description: 'Store hours',
    type: 'http',
    source: 'GET api.fernwood.example/hours.json',
    status: 'published',
    synced: {at: '12 minutes ago', by: 'Ada'},
    published: {at: '12 minutes ago', by: 'Ada'},
    schedule: 'Every hour, auto-publish',
  },
];

/** A "Synced" or "Published" row: the time and who did it, or "Never". */
function Stat(props: {label: string; activity?: Activity; newer?: boolean}) {
  const {label, activity, newer} = props;
  return (
    <div className="ds__stat">
      <dt>{label}</dt>
      {activity ? (
        <dd>
          {newer && <span className="ds__newer" />}
          <span className={newer ? 'ds__newerTime' : undefined}>
            {activity.at}
          </span>
          <span className="cms-muted">·</span>
          <Avatar name={activity.by} />
          {activity.by}
        </dd>
      ) : (
        <dd className="cms-muted">Never</dd>
      )}
    </div>
  );
}

/** The data sources list page, a grid of cards. */
export default function DataSources() {
  return (
    <CmsFrame active="data">
      <style>{DATA_SOURCES_CSS}</style>
      <div style={{padding: '22px 28px', fontSize: '12px'}}>
        <h1 className="cms-h1">Data Sources</h1>
        <p className="cms-muted" style={{margin: '6px 0 16px'}}>
          Sync data from external services like Google Sheets or an HTTP
          endpoint for use on the site.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <div className="cms-segmented">
            <span className="active">
              Active
              <span className="cms-segmented__count">
                {DATA_SOURCES.length}
              </span>
            </span>
            <span>
              Archived
              <span className="cms-segmented__count">2</span>
            </span>
          </div>
          <span
            className="cms-button cms-button--dark"
            style={{marginLeft: 'auto'}}
          >
            <IconPlus />
            New data source
          </span>
        </div>
        <div className="ds__grid">
          {DATA_SOURCES.map((ds) => (
            <article className="ds__card">
              <div className="ds__body">
                <div className="ds__header">
                  <span
                    className={`ds__icon ${
                      ds.type === 'gsheet' ? 'ds__icon--sheet' : ''
                    }`}
                  >
                    {ds.type === 'gsheet' ? (
                      <IconTable size={17} stroke={1.5} />
                    ) : (
                      <IconWorld size={17} stroke={1.5} />
                    )}
                  </span>
                  <div className="ds__title">
                    <div className="ds__id">{ds.id}</div>
                    <div className="ds__source">{ds.source}</div>
                  </div>
                  <div className="ds__badges">
                    <span
                      className={`cms-badge ${
                        ds.status === 'published'
                          ? 'cms-badge--published'
                          : 'cms-badge--draft'
                      }`}
                    >
                      {ds.status === 'published' ? 'Published' : 'Unpublished'}
                    </span>
                    {ds.hasChanges && (
                      <span className="cms-badge cms-badge--locked">
                        Has changes
                      </span>
                    )}
                  </div>
                </div>
                <p className="ds__description">{ds.description}</p>
                <dl className="ds__stats">
                  <Stat
                    label="Synced"
                    activity={ds.synced}
                    newer={ds.hasChanges}
                  />
                  <Stat label="Published" activity={ds.published} />
                  <div className="ds__stat">
                    <dt>Schedule</dt>
                    <dd>{ds.schedule}</dd>
                  </div>
                </dl>
              </div>
              <div className="ds__actions">
                <span className="cms-button">
                  <IconRefresh />
                  Sync
                </span>
                {/* Publish is disabled when the latest sync is already live. */}
                <span
                  className="cms-button cms-button--blue"
                  aria-disabled={ds.status === 'published' && !ds.hasChanges}
                >
                  <IconArrowUp />
                  Publish
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </CmsFrame>
  );
}
