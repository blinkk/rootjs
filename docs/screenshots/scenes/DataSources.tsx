import {IconTable, IconWorld} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {CmsFrame} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-data-sources',
  width: 960,
  height: 600,
  alt: 'The Data Sources page in Root CMS, listing Google Sheets and HTTP JSON feeds with their publish status and when each was last synced and published.',
};

type Status = 'published' | 'unpublished';

const DATA_SOURCES: Array<{
  id: string;
  description: string;
  type: 'gsheet' | 'http';
  url: string;
  status: Status;
  synced: string;
  published: string;
  /** Hover tooltip for the "last synced" time, if shown. */
  syncedTooltip?: string;
}> = [
  {
    id: 'csa-box-contents',
    description: 'Weekly CSA box',
    type: 'gsheet',
    url: 'https://docs.google.com/spreadsheets/d/1CsAb0xW33k',
    status: 'published',
    synced: '5 days ago',
    published: '5 days ago',
  },
  {
    id: 'farm-stand-prices',
    description: 'Farm stand prices',
    type: 'gsheet',
    url: 'https://docs.google.com/spreadsheets/d/1FwMkt7pR1c3s',
    status: 'published',
    synced: '2 hr. ago',
    published: '2 hr. ago',
  },
  {
    id: 'frost-alerts',
    description: 'Frost alerts',
    type: 'http',
    url: 'https://weather.fernwood.example/v1/frost',
    status: 'published',
    synced: 'Feb 11, 2027',
    published: 'Feb 11, 2027',
  },
  {
    id: 'market-events',
    description: 'Market events',
    type: 'http',
    url: 'https://events.fernwood.example/feed.json',
    status: 'published',
    synced: '20 min. ago',
    published: '20 min. ago',
  },
  {
    id: 'planting-calendar',
    description: 'Planting calendar',
    type: 'gsheet',
    url: 'https://docs.google.com/spreadsheets/d/1PlAnt1ngCaL',
    status: 'published',
    synced: '2 days ago',
    published: '2 days ago',
  },
  {
    id: 'seed-inventory',
    description: 'Seed inventory',
    type: 'gsheet',
    url: 'https://docs.google.com/spreadsheets/d/1SeEd5inV3nt0ry',
    status: 'unpublished',
    synced: '4 min. ago',
    published: 'never',
  },
  {
    id: 'store-hours',
    description: 'Store hours',
    type: 'http',
    url: 'https://api.fernwood.example/hours.json',
    status: 'published',
    synced: '12 min. ago',
    published: '12 min. ago',
    syncedTooltip: 'Feb 24, 2027, 07:00 AM by cron',
  },
];

/** A Mantine "xs" status badge, as rendered by `DataSourceStatusBadge`. */
function StatusBadge(props: {status: Status}) {
  const published = props.status === 'published';
  return (
    <span
      className="cms-badge"
      style={{
        height: '16px',
        padding: '0 7px',
        fontSize: '9px',
        background: published
          ? 'linear-gradient(105deg, #12b886, #82c91e)'
          : 'linear-gradient(45deg, #4c6ef5, #15aabf)',
      }}
    >
      {published ? 'Published' : 'Unpublished'}
    </span>
  );
}

/** The time since an action plus its compact action button. */
function StatusButton(props: {label: string; action: 'sync' | 'publish'}) {
  return (
    <span style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
      <span
        style={{whiteSpace: 'nowrap'}}
        className={props.label === 'never' ? 'cms-muted' : undefined}
      >
        {props.label}
      </span>
      <span
        className="cms-button"
        style={{
          height: '22px',
          padding: '0 8px',
          marginLeft: 'auto',
          fontSize: '11px',
        }}
      >
        {props.action}
      </span>
    </span>
  );
}

/** A dark Mantine tooltip, pointing up at the element above it. */
function Tooltip(props: {children: string}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '4px',
        top: 'calc(100% + 2px)',
        padding: '5px 10px',
        borderRadius: '4px',
        background: '#212529',
        color: '#fff',
        fontSize: '11.5px',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      {props.children}
      <span
        style={{
          position: 'absolute',
          left: '18px',
          bottom: '100%',
          borderWidth: '5px',
          borderStyle: 'solid',
          borderColor: 'transparent transparent #212529 transparent',
        }}
      />
    </div>
  );
}

/** The data sources list page. */
export default function DataSources() {
  const cell = {padding: '10px 10px'};
  const divider = {borderLeft: '1px solid var(--cms-border)'};
  return (
    <CmsFrame active="data">
      <div style={{padding: '24px 28px', fontSize: '12px'}}>
        <h1 className="cms-h1">Data Sources</h1>
        <p className="cms-muted" style={{margin: '6px 0 16px'}}>
          Sync data from external services, like Google Sheets and JSON APIs, on
          demand or on a schedule. Publish it on its own or with a release.
        </p>
        <span className="cms-button cms-button--blue">New data source</span>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '8px',
            margin: '8px 0 12px',
          }}
        >
          <span
            style={{
              position: 'relative',
              width: '30px',
              height: '16px',
              borderRadius: '8px',
              background: '#e9ecef',
              border: '1px solid #dee2e6',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '1px',
                left: '1px',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }}
            />
          </span>
          Show archived
        </div>
        <table
          className="cms-table"
          style={{tableLayout: 'fixed', overflow: 'visible'}}
        >
          <thead>
            <tr>
              <th style={{...cell, width: '126px', borderTopLeftRadius: '6px'}}>
                id
              </th>
              <th style={{...cell, ...divider, width: '126px'}}>description</th>
              <th style={{...cell, ...divider, width: '74px'}}>type</th>
              <th style={{...cell, ...divider}}>url</th>
              <th style={{...cell, ...divider, width: '96px'}}>status</th>
              <th style={{...cell, ...divider, width: '144px'}}>last synced</th>
              <th
                style={{
                  ...cell,
                  ...divider,
                  width: '160px',
                  borderTopRightRadius: '6px',
                }}
              >
                last published
              </th>
            </tr>
          </thead>
          <tbody>
            {DATA_SOURCES.map((ds, i) => (
              <tr style={{background: i % 2 === 0 ? '#f8f9fa' : undefined}}>
                <td style={{...cell, textDecoration: 'underline'}}>{ds.id}</td>
                <td style={{...cell, ...divider}}>{ds.description}</td>
                <td style={{...cell, ...divider}}>
                  <span
                    style={{display: 'flex', alignItems: 'center', gap: '6px'}}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        background: 'var(--cms-chip)',
                        color: 'var(--cms-text-muted)',
                      }}
                    >
                      {ds.type === 'gsheet' ? (
                        <IconTable size={13} stroke={1.5} />
                      ) : (
                        <IconWorld size={13} stroke={1.5} />
                      )}
                    </span>
                    {ds.type}
                  </span>
                </td>
                <td style={{...cell, ...divider}}>
                  <span
                    style={{display: 'flex', alignItems: 'center', gap: '6px'}}
                  >
                    {ds.type === 'gsheet' && (
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flex: '0 0 22px',
                          height: '22px',
                          borderRadius: '4px',
                          background: '#40c057',
                          color: '#fff',
                        }}
                      >
                        <IconTable size={15} stroke={2.25} />
                      </span>
                    )}
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textDecoration:
                          ds.type === 'gsheet' ? 'underline' : undefined,
                      }}
                    >
                      {ds.url}
                    </span>
                  </span>
                </td>
                <td style={{...cell, ...divider}}>
                  <StatusBadge status={ds.status} />
                </td>
                <td style={{...cell, ...divider, position: 'relative'}}>
                  {ds.syncedTooltip && <Tooltip>{ds.syncedTooltip}</Tooltip>}
                  <StatusButton label={ds.synced} action="sync" />
                </td>
                <td style={{...cell, ...divider}}>
                  <StatusButton label={ds.published} action="publish" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CmsFrame>
  );
}
