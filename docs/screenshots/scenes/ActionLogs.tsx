import {IconChevronDown, IconSearch} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {Avatar, CmsFrame} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-action-logs',
  width: 960,
  height: 600,
  alt: 'The Action Logs page in Root CMS, an audit trail of who saved, published, scheduled, synced and re-shared what and when, with links to each change.',
};

interface LogRow {
  time: string;
  /** Fixture user name, or `cron` for scheduled jobs. */
  by: string;
  action: string;
  metadata: Array<[string, string]>;
  /** Quick link buttons (the real page can show a few per row). */
  link: string;
}

/** Recent actions, newest first. Action names and metadata match the CMS. */
const ROWS: LogRow[] = [
  {
    time: 'Mar 02, 04:52 PM',
    by: 'Ada',
    action: 'release.publish',
    metadata: [
      ['releaseId', 'spring-harvest-2027'],
      ['scheduledAt', 'Mar 03, 2027 07:00 AM'],
    ],
    link: 'Open release',
  },
  {
    time: 'Mar 02, 04:31 PM',
    by: 'Lea',
    action: 'doc.import_translations',
    metadata: [['docId', 'Pages/spring-harvest']],
    link: 'Show changes',
  },
  {
    time: 'Mar 02, 04:05 PM',
    by: 'Kenji',
    action: 'doc.publish',
    metadata: [
      ['docId', 'GrowingGuides/beet-basics'],
      ['publishMessage', 'Add sowing dates'],
    ],
    link: 'Show changes',
  },
  {
    time: 'Mar 02, 03:00 PM',
    by: 'cron',
    action: 'datasource.cron_sync',
    metadata: [
      ['datasourceId', 'produce-prices'],
      ['autoPublish', 'true'],
    ],
    link: 'Open data source',
  },
  {
    time: 'Mar 02, 02:36 PM',
    by: 'Priya',
    action: 'doc.lock_publishing',
    metadata: [
      ['docId', 'Pages/index'],
      ['reason', 'Hold for spring launch'],
    ],
    link: 'Open doc',
  },
  {
    time: 'Mar 02, 02:10 PM',
    by: 'Ada',
    action: 'acls.save_groups',
    metadata: [
      ['groupCount', '2'],
      ['userCount', '9'],
      ['collections', 'GrowingGuides, Recipes'],
    ],
    link: 'Open settings',
  },
  {
    time: 'Mar 02, 01:48 PM',
    by: 'Priya',
    action: 'doc.save',
    metadata: [['docId', 'Pages/spring-harvest']],
    link: 'Show changes',
  },
  {
    time: 'Mar 02, 11:15 AM',
    by: 'Sam',
    action: 'tasks.create',
    metadata: [['taskId', '142']],
    link: 'Open task',
  },
];

const CELL = {padding: '7px 8px', verticalAlign: 'middle'};

/** A Mantine-style filter input. */
function Filter(props: {label: string; search?: boolean; select?: boolean}) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: props.search ? '180px' : '140px',
        height: '30px',
        padding: '0 10px',
        border: '1px solid #ced4da',
        borderRadius: '4px',
        background: '#fff',
        color: props.select ? 'var(--cms-text)' : '#adb5bd',
        fontSize: '12px',
      }}
    >
      {props.search && <IconSearch size={14} color="#adb5bd" />}
      {props.label}
      {!props.search && (
        <IconChevronDown
          size={14}
          color="#adb5bd"
          style={{marginLeft: 'auto'}}
        />
      )}
    </span>
  );
}

/** The action logs page, an audit trail of changes made in the CMS. */
export default function ActionLogs() {
  return (
    <CmsFrame active="home">
      <div style={{padding: '22px 24px', fontSize: '12.5px'}}>
        <h1 className="cms-h1">Action Logs</h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            margin: '16px 0 14px',
          }}
        >
          <Filter label="Search actions..." search />
          <Filter label="Filter by action" />
          <Filter label="Filter by user" />
          <Filter label="All time" select />
          <span
            className="cms-muted"
            style={{marginLeft: 'auto', whiteSpace: 'nowrap'}}
          >
            Showing 1–50 of 1,284 actions
          </span>
        </div>
        <div className="cms-panel" style={{overflow: 'hidden'}}>
          <table
            className="cms-mono"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '11px',
              letterSpacing: '-0.2px',
            }}
          >
            <thead>
              <tr>
                {['Timestamp', 'User', 'Action', 'Details', 'Links'].map(
                  (label) => (
                    <th
                      style={{
                        ...CELL,
                        textAlign: 'left',
                        fontWeight: 600,
                        color: '#495057',
                        borderBottom: '1px solid var(--cms-border)',
                      }}
                    >
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid var(--cms-border)',
                  }}
                >
                  <td style={{...CELL, whiteSpace: 'nowrap'}}>{row.time}</td>
                  <td style={{...CELL, whiteSpace: 'nowrap'}}>
                    <span
                      className="cms-muted"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Avatar name={row.by === 'cron' ? 'Cron' : row.by} />
                      {row.by === 'cron'
                        ? 'cron'
                        : `${row.by.toLowerCase()}@fernwood.example`}
                    </span>
                  </td>
                  <td style={{...CELL, whiteSpace: 'nowrap'}}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#f1f3f5',
                        fontWeight: 500,
                      }}
                    >
                      {row.action}
                    </span>
                  </td>
                  <td style={CELL}>
                    {row.metadata.map(([key, value]) => (
                      <div style={{lineHeight: 1.55}}>
                        <span className="cms-muted">{key}:</span> {value}
                      </div>
                    ))}
                  </td>
                  <td
                    style={{
                      ...CELL,
                      whiteSpace: 'nowrap',
                      paddingRight: '12px',
                    }}
                  >
                    <span
                      className="cms-button"
                      style={{
                        height: '22px',
                        padding: '0 8px',
                        fontFamily: 'var(--cms-font)',
                        fontSize: '11px',
                        letterSpacing: 0,
                      }}
                    >
                      {row.link}
                    </span>
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
