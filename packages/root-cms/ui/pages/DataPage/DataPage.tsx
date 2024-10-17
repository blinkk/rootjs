import {Button, Loader, Table} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {DataSourceStatusButton} from '../../components/DataSourceStatusButton/DataSourceStatusButton.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {DataSource, listDataSources} from '../../db/data-sources.js';
import {Layout} from '../../layout/Layout.js';
import './DataPage.css';

export function DataPage() {
  return (
    <Layout>
      <div className="DataPage">
        <div className="DataPage__header">
          <Heading size="h1">Data Sources</Heading>
          <Text as="p">
            Add data sources to sync data from external services, like Google
            Sheets.
          </Text>
          <div className="DataPage__header__buttons">
            <Button component="a" color="blue" size="xs" href="/cms/data/new">
              New data source
            </Button>
          </div>
        </div>
        <DataPage.DataSourcesTable />
      </div>
    </Layout>
  );
}

DataPage.DataSourcesTable = () => {
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<DataSource[]>([]);

  async function init() {
    const dataSources = await listDataSources();
    setTableData(dataSources);
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  return (
    <div className="DataPage__DataSourcesTable">
      {loading && <Loader color="gray" size="xl" />}
      {tableData.length > 0 && (
        <Table verticalSpacing="xs" striped highlightOnHover fontSize="xs">
          <thead>
            <tr>
              <th>id</th>
              <th>description</th>
              <th>type</th>
              <th>url</th>
              <th>last synced</th>
              <th>last published</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((dataSource) => (
              <tr key={dataSource.id}>
                <td>
                  <a href={`/cms/data/${dataSource.id}`}>{dataSource.id}</a>
                </td>
                <td>{dataSource.description || ''}</td>
                <td>{dataSource.type}</td>
                <td>{dataSource.url}</td>
                <td>
                  <DataSourceStatusButton
                    dataSource={dataSource}
                    action="sync"
                  />
                </td>
                <td>
                  <DataSourceStatusButton
                    dataSource={dataSource}
                    action="publish"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
};
