import {IconArrowUp, IconPlus, IconRefresh} from '@tabler/icons-preact';
import {Timestamp} from 'firebase/firestore';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {Layout} from '../../../../app/layout/Layout.js';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {Text} from '../../../../components/Text/Text.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {SegmentedControl} from '../../../../primitives/SegmentedControl/SegmentedControl.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {testCanEdit, testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {DataSourceActivity} from '../../components/DataSourceActivity/DataSourceActivity.js';
import {useDataSourceChangesModal} from '../../components/DataSourceChangesModal/DataSourceChangesModal.js';
import {DataSourceIcon} from '../../components/DataSourceIcon/DataSourceIcon.js';
import {DataSourceStatusBadge} from '../../components/DataSourceStatusBadge/DataSourceStatusBadge.js';
import {HasChangesBadge} from '../../components/HasChangesBadge/HasChangesBadge.js';
import {
  DataSource,
  formatCronSchedule,
  getPublishDisabledReason,
  listDataSources,
  testHasUnpublishedChanges,
} from '../../data-source.js';
import {useDataSourceAction} from '../../useDataSourceAction.js';

type DataSourceListFilter = 'active' | 'archived';

const FILTER_OPTIONS: Array<{label: string; value: DataSourceListFilter}> = [
  {label: 'Active', value: 'active'},
  {label: 'Archived', value: 'archived'},
];

export function DataPage() {
  usePageTitle('Data Sources');
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canEdit = testCanEdit(roles, currentUserEmail);
  const canPublish = testCanPublish(roles, currentUserEmail);

  return (
    <Layout>
      <div className="DataPage bg-page p-page">
        <div className="DataPage__header mb-8 max-w-7xl">
          <Heading size="h1">Data Sources</Heading>
          <Text as="p" className="mb-0 mt-2 max-w-prose">
            Sync data from external services like Google Sheets or an HTTP
            endpoint for use on the site.
          </Text>
        </div>
        <DataPage.DataSourcesGrid canEdit={canEdit} canPublish={canPublish} />
      </div>
    </Layout>
  );
}

DataPage.DataSourcesGrid = (props: {canEdit: boolean; canPublish: boolean}) => {
  const [loading, setLoading] = useState(true);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [storedFilter, setFilter] = useLocalStorage<DataSourceListFilter>(
    'root-cms-data-sources-filter',
    'active'
  );
  // Fall back to the default if the stored value is no longer a valid filter.
  const filter = FILTER_OPTIONS.some((option) => option.value === storedFilter)
    ? storedFilter
    : 'active';

  async function init() {
    await notifyErrors(async () => {
      const dataSources = await withTimeout(
        listDataSources(),
        undefined,
        'loading data sources'
      );
      setDataSources(dataSources);
    });
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  const filterCounts = useMemo(() => {
    const archived = dataSources.filter((ds) => Boolean(ds.archivedAt)).length;
    return {active: dataSources.length - archived, archived};
  }, [dataSources]);

  const filteredDataSources = useMemo(
    () =>
      dataSources.filter(
        (ds) => Boolean(ds.archivedAt) === (filter === 'archived')
      ),
    [dataSources, filter]
  );

  if (loading) {
    return <Spinner size="lg" className="text-muted" />;
  }

  return (
    <div className="DataPage__dataSources max-w-7xl">
      <div className="DataPage__filters mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl
          aria-label="Data source filters"
          size="md"
          value={filter}
          onValueChange={(value) => setFilter(value)}
          data={FILTER_OPTIONS.map((option) => ({
            value: option.value,
            label: (
              <span className="DataPage__filter flex items-center justify-center gap-1.5 whitespace-nowrap">
                {option.label}
                <span className="DataPage__filterCount rounded-full bg-chip px-1.5 text-xs leading-4 text-muted">
                  {filterCounts[option.value]}
                </span>
              </span>
            ),
          }))}
        />
        <div className="DataPage__newDataSource ml-auto">
          <ConditionalTooltip
            label="You don't have access to create new data sources"
            condition={!props.canEdit}
          >
            <Button
              variant="primary"
              icon={<IconPlus />}
              href="/cms/data/new"
              disabled={!props.canEdit}
            >
              New data source
            </Button>
          </ConditionalTooltip>
        </div>
      </div>
      {filteredDataSources.length > 0 ? (
        <div className="DataPage__grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredDataSources.map((dataSource) => (
            <DataPage.Card
              key={dataSource.id}
              dataSource={dataSource}
              canPublish={props.canPublish}
              onChange={() => init()}
            />
          ))}
        </div>
      ) : (
        <Surface>
          <Text
            className="DataPage__noResults px-5 py-10 text-center"
            size="body-sm"
            color="gray"
          >
            {filter === 'archived'
              ? 'No archived data sources.'
              : 'No data sources yet.'}
          </Text>
        </Surface>
      )}
    </div>
  );
};

interface DataSourceCardProps {
  dataSource: DataSource;
  canPublish: boolean;
  /** Called after the data source is synced or published. */
  onChange: () => void;
}

/**
 * A data source's card. The whole card links to the data source's page, while
 * the spreadsheet icon, badges, and action buttons sit above that link.
 */
DataPage.Card = (props: DataSourceCardProps) => {
  const dataSource = props.dataSource;
  const isArchived = Boolean(dataSource.archivedAt);
  const hasChanges = !isArchived && testHasUnpublishedChanges(dataSource);
  const publishDisabledReason = getPublishDisabledReason(
    dataSource,
    props.canPublish
  );
  const sync = useDataSourceAction(dataSource, 'sync', props.onChange);
  const publish = useDataSourceAction(dataSource, 'publish', props.onChange);
  const changesModal = useDataSourceChangesModal();

  return (
    <article className="DataPage__card relative flex flex-col rounded-xl border border-border bg-surface shadow-sm hover:border-border-strong">
      <div className="DataPage__cardBody flex flex-1 flex-col gap-3 p-4">
        <div className="DataPage__cardHeader flex items-start gap-3">
          {dataSource.type === 'gsheet' && dataSource.url ? (
            <Tooltip label="Open spreadsheet">
              <a
                className="DataPage__sheetLink relative z-1 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                href={dataSource.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open spreadsheet for ${dataSource.id}`}
              >
                <DataSourceIcon
                  type="gsheet"
                  className="bg-success-soft text-success hover:brightness-95"
                />
              </a>
            </Tooltip>
          ) : (
            <DataSourceIcon type={dataSource.type} />
          )}
          <div className="DataPage__cardTitle min-w-0 flex-1">
            <a
              className="DataPage__cardLink block truncate font-mono text-base font-semibold text-strong no-underline underline-offset-3 after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
              href={`/cms/data/${dataSource.id}`}
            >
              {dataSource.id}
            </a>
            <div className="DataPage__cardSource mt-0.5 truncate text-sm text-muted">
              {getSourceLabel(dataSource)}
            </div>
          </div>
          <div className="DataPage__cardBadges relative z-1 flex flex-col items-end gap-1">
            <DataSourceStatusBadge dataSource={dataSource} />
            {hasChanges && (
              <HasChangesBadge
                className="DataPage__hasChanges"
                onActivate={() =>
                  changesModal.open(dataSource, {onPublish: props.onChange})
                }
              />
            )}
          </div>
        </div>
        {dataSource.description && (
          <p className="DataPage__cardDescription m-0 text-md leading-snug text-fg">
            {dataSource.description}
          </p>
        )}
        <dl className="DataPage__cardStats m-0 mt-auto flex flex-col gap-1.5 border-t border-surface-active pt-3 text-sm">
          <DataPage.Stat
            label="Synced"
            at={dataSource.syncedAt}
            by={dataSource.syncedBy}
            newer={hasChanges}
          />
          <DataPage.Stat
            label="Published"
            at={dataSource.publishedAt}
            by={dataSource.publishedBy}
          />
          <div className="DataPage__cardStat flex justify-between gap-3">
            <dt className="text-muted">Schedule</dt>
            <dd className="m-0 truncate text-right">
              {formatCronSchedule(dataSource.cron)}
              {dataSource.cron?.enabled && dataSource.cron.autoPublish
                ? ', auto-publish'
                : ''}
            </dd>
          </div>
        </dl>
      </div>
      <div className="DataPage__cardActions relative z-1 grid grid-cols-2 gap-2 border-t border-surface-active px-4 py-2.5">
        <Tooltip label="Data source is archived" disabled={!isArchived}>
          <Button
            className="w-full"
            icon={<IconRefresh />}
            loading={sync.loading}
            disabled={isArchived}
            onClick={() => sync.run()}
          >
            Sync
          </Button>
        </Tooltip>
        <Tooltip
          label={publishDisabledReason}
          disabled={!publishDisabledReason}
        >
          <Button
            className="w-full"
            variant="blue"
            icon={<IconArrowUp />}
            loading={publish.loading}
            disabled={Boolean(publishDisabledReason)}
            onClick={() => publish.run()}
          >
            Publish
          </Button>
        </Tooltip>
      </div>
    </article>
  );
};

/** A "Synced" or "Published" row, e.g. "12 minutes ago · Jane". */
DataPage.Stat = (props: {
  label: string;
  at?: Timestamp;
  by?: string;
  /** Marks the time as newer than the last publish. */
  newer?: boolean;
}) => {
  return (
    <div className="DataPage__cardStat flex justify-between gap-3">
      <dt className="text-muted">{props.label}</dt>
      <dd className="m-0 flex min-w-0 justify-end">
        <DataSourceActivity at={props.at} by={props.by} newer={props.newer} />
      </dd>
    </div>
  );
};

/**
 * Describes where a data source reads from: "Google Sheet", or the request
 * method and url for HTTP.
 */
function getSourceLabel(dataSource: DataSource): string {
  if (dataSource.type === 'gsheet') {
    return 'Google Sheet';
  }
  const method = dataSource.httpOptions?.method || 'GET';
  const url = (dataSource.url || '').replace(/^https?:\/\//, '');
  return `${method} ${url}`;
}
