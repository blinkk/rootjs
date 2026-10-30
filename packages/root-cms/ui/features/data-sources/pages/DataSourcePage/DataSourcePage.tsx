import {
  IconArrowUp,
  IconExternalLink,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {Text} from '../../../../components/Text/Text.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {JsonInput} from '../../../../primitives/JsonInput/JsonInput.js';
import {SegmentedControl} from '../../../../primitives/SegmentedControl/SegmentedControl.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../../primitives/Table/Table.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {DataSourceActivity} from '../../components/DataSourceActivity/DataSourceActivity.js';
import {DataSourceDiff} from '../../components/DataSourceDiff/DataSourceDiff.js';
import {DataSourceStatusBadge} from '../../components/DataSourceStatusBadge/DataSourceStatusBadge.js';
import {HasChangesBadge} from '../../components/HasChangesBadge/HasChangesBadge.js';
import {toDataTable} from '../../data-source-diff.js';
import {
  DataSource,
  DataSourceData,
  formatCronSchedule,
  getDataSource,
  getFromDataSource,
  getPublishDisabledReason,
  testHasUnpublishedChanges,
} from '../../data-source.js';
import {useDataSourceAction} from '../../useDataSourceAction.js';

/** Which data the data section shows. */
type DataView = 'synced' | 'published' | 'changes';

const VIEW_OPTIONS: Array<{label: string; value: DataView}> = [
  {label: 'Synced', value: 'synced'},
  {label: 'Published', value: 'published'},
  {label: 'Changes', value: 'changes'},
];

export function DataSourcePage(props: {id: string}) {
  usePageTitle(`Data Source: ${props.id}`);
  const id = props.id;
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [draft, setDraft] = useState<DataSourceData | null>(null);
  const [published, setPublished] = useState<DataSourceData | null>(null);
  const [view, setView] = useState<DataView>('synced');

  async function init() {
    await notifyErrors(async () => {
      const [dataSource, draft, published] = await withTimeout(
        Promise.all([
          getDataSource(id),
          getFromDataSource(id, {mode: 'draft'}),
          getFromDataSource(id, {mode: 'published'}),
        ]),
        undefined,
        'loading the data source'
      );
      setDataSource(dataSource);
      setDraft(draft);
      setPublished(published);
    });
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  return (
    <Layout>
      <div className="DataSourcePage bg-page p-page">
        <div className="DataSourcePage__content max-w-7xl">
          <Breadcrumbs
            className="DataSourcePage__breadcrumbs mb-3"
            items={[{label: 'Data Sources', href: '/cms/data'}, {label: id}]}
          />
          {loading ? (
            <Spinner size="lg" className="text-muted" />
          ) : dataSource ? (
            <>
              <DataSourcePage.Header
                dataSource={dataSource}
                onChange={() => init()}
                onShowChanges={() => setView('changes')}
              />
              <DataSourcePage.Stats dataSource={dataSource} />
              <DataSourcePage.DataSection
                dataSource={dataSource}
                draft={draft}
                published={published}
                view={view}
                onViewChange={setView}
              />
            </>
          ) : (
            <Text className="DataSourcePage__notFound">
              Data source not found.
            </Text>
          )}
        </div>
      </div>
    </Layout>
  );
}

/** The data source's id, status, description and actions. */
DataSourcePage.Header = (props: {
  dataSource: DataSource;
  /** Called after the data source is synced or published. */
  onChange: () => void;
  onShowChanges: () => void;
}) => {
  const dataSource = props.dataSource;
  const isArchived = Boolean(dataSource.archivedAt);
  const hasChanges = !isArchived && testHasUnpublishedChanges(dataSource);
  const {roles} = useProjectRoles();
  const canPublish = testCanPublish(roles, window.firebase.user.email || '');
  const publishDisabledReason = getPublishDisabledReason(
    dataSource,
    canPublish
  );
  const sync = useDataSourceAction(dataSource, 'sync', props.onChange);
  const publish = useDataSourceAction(dataSource, 'publish', props.onChange);

  return (
    <div className="DataSourcePage__header mb-6 flex flex-wrap items-start gap-4">
      <div className="DataSourcePage__headerText min-w-0 grow basis-100">
        <div className="DataSourcePage__title flex flex-wrap items-center gap-2.5">
          <Heading
            size="h1"
            weight="semi-bold"
            className="min-w-0 wrap-anywhere"
          >
            {dataSource.id}
          </Heading>
          <DataSourceStatusBadge dataSource={dataSource} />
          {hasChanges && <HasChangesBadge onActivate={props.onShowChanges} />}
        </div>
        {dataSource.description && (
          <Text as="p" color="gray" className="mb-0 mt-2 max-w-prose">
            {dataSource.description}
          </Text>
        )}
      </div>
      <div className="DataSourcePage__actions flex flex-wrap items-center gap-2">
        <IconButton
          label="Configure"
          variant="default"
          href={`/cms/data/${dataSource.id}/edit`}
        >
          <IconSettings stroke="1.5" />
        </IconButton>
        {dataSource.previewUrl && (
          <Button href={dataSource.previewUrl} target="_blank">
            Preview
          </Button>
        )}
        <Tooltip label="Data source is archived" disabled={!isArchived}>
          <Button
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
    </div>
  );
};

/** A strip of the data source's source, sync and publish info. */
DataSourcePage.Stats = (props: {dataSource: DataSource}) => {
  const dataSource = props.dataSource;
  const hasChanges =
    !dataSource.archivedAt && testHasUnpublishedChanges(dataSource);
  return (
    <dl className="DataSourcePage__stats m-0 mb-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-surface-active shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      <DataSourcePage.Stat label="Source">
        <DataSourcePage.Source dataSource={dataSource} />
      </DataSourcePage.Stat>
      <DataSourcePage.Stat label="Last synced">
        <DataSourceActivity
          at={dataSource.syncedAt}
          by={dataSource.syncedBy}
          newer={hasChanges}
        />
      </DataSourcePage.Stat>
      <DataSourcePage.Stat label="Last published">
        <DataSourceActivity
          at={dataSource.publishedAt}
          by={dataSource.publishedBy}
        />
      </DataSourcePage.Stat>
      <DataSourcePage.Stat label="Schedule">
        {formatCronSchedule(dataSource.cron)}
        {dataSource.cron?.enabled && dataSource.cron.autoPublish
          ? ', auto-publish'
          : ''}
      </DataSourcePage.Stat>
    </dl>
  );
};

DataSourcePage.Stat = (props: {label: string; children: ComponentChildren}) => {
  return (
    <div className="DataSourcePage__stat flex min-w-0 flex-col gap-1 bg-surface px-4 py-3.5">
      <dt className="DataSourcePage__statLabel text-sm text-muted">
        {props.label}
      </dt>
      <dd className="DataSourcePage__statValue m-0 flex min-h-6 min-w-0 items-center gap-2 text-md text-fg">
        {props.children}
      </dd>
    </div>
  );
};

/**
 * Where the data comes from: a link that opens the spreadsheet for Google
 * Sheets, or the request method and url for HTTP.
 */
DataSourcePage.Source = (props: {dataSource: DataSource}) => {
  const dataSource = props.dataSource;
  if (dataSource.type === 'gsheet') {
    return (
      <a
        className="DataSourcePage__sheetLink group inline-flex min-w-0 items-center gap-2 rounded-sm text-strong no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        href={dataSource.url}
        target="_blank"
        rel="noreferrer"
        title="Open spreadsheet"
      >
        <span className="DataSourcePage__sheetIcon flex size-6 shrink-0 items-center justify-center rounded-md bg-success-soft text-success">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 10h18M9 4v16" />
          </svg>
        </span>
        <span className="truncate underline-offset-3 group-hover:underline">
          Google Sheet
        </span>
        <IconExternalLink
          className="shrink-0 text-muted"
          size={14}
          aria-label="Opens in a new tab"
        />
      </a>
    );
  }
  const method = dataSource.httpOptions?.method || 'GET';
  return (
    <span
      className="DataSourcePage__httpSource truncate"
      title={dataSource.url}
    >
      {method} {dataSource.url}
    </span>
  );
};

/** The synced or published data, or the changes between them. */
DataSourcePage.DataSection = (props: {
  dataSource: DataSource;
  draft: DataSourceData | null;
  published: DataSourceData | null;
  view: DataView;
  onViewChange: (view: DataView) => void;
}) => {
  const {dataSource, draft, published} = props;
  const isPublished = Boolean(dataSource.publishedAt?.toMillis?.());
  const hasChanges = testHasUnpublishedChanges(dataSource);
  // Fall back to the synced data if the selected view no longer applies, e.g.
  // the changes view after the changes are published.
  let view = props.view;
  if (
    (view === 'published' && !isPublished) ||
    (view === 'changes' && !hasChanges)
  ) {
    view = 'synced';
  }

  let caption = '';
  if (view === 'synced' && draft?.data) {
    if (!isPublished) {
      caption = 'Not published yet. Publish to make this data live.';
    } else if (hasChanges) {
      caption = "Synced data isn't live until it's published.";
    } else {
      caption = 'Matches the published data.';
    }
  } else if (view === 'published') {
    caption = 'Live on the site.';
  }
  return (
    <div className="DataSourcePage__data">
      <div className="DataSourcePage__dataHeader mb-3 flex flex-wrap items-center gap-3">
        <Heading size="h2" className="mr-2">
          Data
        </Heading>
        <SegmentedControl
          aria-label="Data view"
          size="md"
          value={view}
          onValueChange={(value) => props.onViewChange(value)}
          data={VIEW_OPTIONS.map((option) => ({
            ...option,
            disabled:
              (option.value === 'published' && !isPublished) ||
              (option.value === 'changes' && !hasChanges),
          }))}
        />
        {caption && (
          <Text size="body-sm" color="gray" className="ml-auto">
            {caption}
          </Text>
        )}
      </div>
      {view === 'synced' && (
        <DataSourcePage.Data
          dataSource={dataSource}
          data={draft}
          emptyMessage="Not synced yet."
        />
      )}
      {view === 'published' && (
        <DataSourcePage.Data
          dataSource={dataSource}
          data={published}
          emptyMessage="Not published yet."
        />
      )}
      {view === 'changes' &&
        (draft ? (
          <DataSourceDiff
            dataSource={dataSource}
            draft={draft}
            published={published}
          />
        ) : (
          <DataSourcePage.Empty>Not synced yet.</DataSourcePage.Empty>
        ))}
    </div>
  );
};

DataSourcePage.Data = (props: {
  dataSource: DataSource;
  data: DataSourceData | null;
  emptyMessage: string;
}) => {
  const dataSource = props.dataSource;
  if (!props.data?.data) {
    return <DataSourcePage.Empty>{props.emptyMessage}</DataSourcePage.Empty>;
  }
  if (dataSource.type === 'gsheet') {
    const {headers, rows} = toDataTable(
      dataSource.dataFormat,
      props.data.data,
      props.data.headers
    );
    return (
      <Surface className="DataSourcePage__dataContent rounded-xl">
        <DataSourcePage.DataTable headers={headers} rows={rows} />
      </Surface>
    );
  }
  return <DataSourcePage.DefaultDataDisplay data={props.data.data} />;
};

DataSourcePage.Empty = (props: {children: ComponentChildren}) => {
  return (
    <Surface className="DataSourcePage__empty rounded-xl">
      <Text className="px-5 py-10 text-center" size="body-sm" color="gray">
        {props.children}
      </Text>
    </Surface>
  );
};

DataSourcePage.DataTable = (props: {headers?: string[]; rows?: string[][]}) => {
  const headers = props.headers || [];
  const rows = props.rows || [];

  return (
    <div className="DataSourcePage__DataTable">
      <Table
        className="rounded-none border-0"
        classNames={{table: 'DataSourcePage__DataTable__table'}}
        dense
        striped
        hover
        label="Data"
      >
        {headers.length > 0 && (
          <TableHead>
            <TableRow>
              {headers.map((header) => (
                <TableHeaderCell key={header}>{header}</TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>
        )}
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.map((cell, i) => (
                <TableCell
                  key={i}
                  className="max-w-100 overflow-hidden text-ellipsis"
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

DataSourcePage.DefaultDataDisplay = (props: {data: any}) => {
  const data = props.data;
  if (typeof data === 'object') {
    return (
      <JsonInput
        size="md"
        value={JSON.stringify(data, null, 2)}
        minRows={20}
        maxRows={100}
      />
    );
  }
  return <Textarea size="md" value={String(data)} minRows={12} maxRows={100} />;
};
