import {IconSettings, IconTable} from '@tabler/icons-preact';
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
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {DataSourceStatusButton} from '../../components/DataSourceStatusButton/DataSourceStatusButton.js';
import {
  DataSourceData,
  DataSource,
  getFromDataSource,
  getDataSource,
} from '../../data-source.js';

/** The green "open spreadsheet" button, as in Mantine's filled green. */
const SHEET_BUTTON_CLASSES =
  'bg-success text-inverse hover:bg-success hover:brightness-90 active:bg-success';

export function DataSourcePage(props: {id: string}) {
  usePageTitle(`Data Source: ${props.id}`);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [data, setData] = useState<any>(null);
  const id = props.id;

  async function init() {
    await notifyErrors(async () => {
      const dataSource = await withTimeout(
        getDataSource(id),
        undefined,
        'loading the data source'
      );
      setDataSource(dataSource);
      if (dataSource) {
        const data = await withTimeout(
          getFromDataSource(id, {mode: 'draft'}),
          undefined,
          'loading the data source data'
        );
        setData(data);
      }
    });
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  function onAction(action: string) {
    if (action === 'sync') {
      // When data is synced, re-fetch data from the data source.
      init();
    }
  }

  return (
    <Layout>
      <div className="DataSourcePage bg-page p-(--cms-page-padding-mobile) md:p-(--cms-page-padding)">
        <div className="DataSourcePage__header mb-8">
          <Breadcrumbs
            className="DataSourcePage__header__breadcrumbs mb-3"
            items={[{label: 'Data', href: '/cms/data'}, {label: id}]}
          />
          <div className="DataSourcePage__header__titleWrap flex items-center gap-3">
            <Heading size="h1" className="min-w-0 break-words">
              Data Source: {id}
            </Heading>
            <div className="DataSourcePage__header__controls flex items-center">
              <IconButton label="Configure" href={`/cms/data/${props.id}/edit`}>
                <IconSettings stroke="1.5" />
              </IconButton>
            </div>
          </div>
          {dataSource?.description && (
            <Text as="p" className="mt-1">
              {dataSource.description}
            </Text>
          )}
        </div>

        {dataSource && (
          <DataSourcePage.SyncStatus
            dataSource={dataSource}
            onAction={onAction}
          />
        )}

        {loading ? (
          <div className="DataSourcePage__loading flex justify-center p-5 text-muted">
            <Spinner size="lg" />
          </div>
        ) : dataSource ? (
          <DataSourcePage.DataSection dataSource={dataSource} data={data} />
        ) : (
          <div className="DataSourcePage__notFound">Not Found</div>
        )}
      </div>
    </Layout>
  );
}

DataSourcePage.SyncStatus = (props: {
  dataSource: DataSource;
  onAction?: (action: string) => void;
}) => {
  const dataSource = props.dataSource;
  return (
    <div className="DataSourcePage__SyncStatus">
      <Heading size="h2" className="mb-4">
        Status
      </Heading>
      <Surface className="DataSourcePage__SyncStatus__content max-w-100">
        <Table
          dense
          striped
          hover
          label="Sync status"
          className="rounded-none border-0"
        >
          <TableHead>
            <TableRow>
              <TableHeaderCell>last synced</TableHeaderCell>
              <TableHeaderCell>last published</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>
                <DataSourceStatusButton
                  dataSource={dataSource}
                  action="sync"
                  onAction={() => {
                    if (props.onAction) {
                      props.onAction('sync');
                    }
                  }}
                />
              </TableCell>
              <TableCell>
                <DataSourceStatusButton
                  dataSource={dataSource}
                  action="publish"
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Surface>
    </div>
  );
};

DataSourcePage.DataSection = (props: {
  dataSource: DataSource;
  data: DataSourceData;
}) => {
  const {data, headers: storedHeaders} = props.data || {};
  const dataSource = props.dataSource;

  if (!data) {
    return null;
  }

  if (dataSource.type === 'gsheet') {
    let headers: string[] | undefined = storedHeaders;
    let rows: any[] = [];
    if (dataSource.dataFormat === 'grid') {
      // The first row of a grid contains the column headers.
      const grid = (data as string[][]) || [];
      headers = storedHeaders || grid[0] || [];
      rows = grid.slice(1);
    } else {
      const items = data as any[];
      if (!headers) {
        // Reformat Array<Record<string, string>> to string[][]. Preserve key order
        // by iterating through object keys as encountered.
        const headersSet = new Set<string>();
        items.forEach((item) => {
          for (const key in item) {
            if (key) {
              headersSet.add(key);
            }
          }
        });
        headers = Array.from(headersSet);
      }
      items.forEach((item) => {
        rows.push(headers!.map((header) => item[header] || ''));
      });
    }
    return (
      <DataSourcePage.DataSectionWrap dataSource={dataSource}>
        <DataSourcePage.DataTable headers={headers} rows={rows} />
      </DataSourcePage.DataSectionWrap>
    );
  }

  if (dataSource.type === 'http') {
    return (
      <DataSourcePage.DataSectionWrap dataSource={dataSource}>
        <DataSourcePage.DefaultDataDisplay data={data} />
      </DataSourcePage.DataSectionWrap>
    );
  }

  console.log(`unsupported data type: ${dataSource.type}`);
  return null;
};

DataSourcePage.DataSectionWrap = (props: {
  dataSource: DataSource;
  children: ComponentChildren;
}) => {
  return (
    <div className="DataSourcePage__DataSection mt-10">
      <div className="DataSourcePage__DataSection__header mb-4 flex flex-wrap items-center justify-between gap-3">
        <Heading size="h2">Data</Heading>
        <div className="DataSourcePage__DataSection__header__actions flex items-center gap-3">
          {props.dataSource.url?.startsWith(
            'https://docs.google.com/spreadsheets/'
          ) && (
            <IconButton
              label="Open spreadsheet"
              href={props.dataSource.url}
              target="_blank"
              className={SHEET_BUTTON_CLASSES}
            >
              <IconTable stroke="2.25" />
            </IconButton>
          )}
          {props.dataSource.previewUrl && (
            <Button
              variant="default"
              href={props.dataSource.previewUrl}
              target="_blank"
            >
              Preview
            </Button>
          )}
        </div>
      </div>
      <Surface className="DataSourcePage__DataSection__content">
        {props.children}
      </Surface>
    </div>
  );
};

DataSourcePage.DataTable = (props: {headers?: string[]; rows?: string[][]}) => {
  const headers = props.headers || [];
  const rows = props.rows || [];

  return (
    <div className="DataSourcePage__DataTable">
      <Table
        className="rounded-none border-0"
        tableClassName="DataSourcePage__DataTable__table"
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
