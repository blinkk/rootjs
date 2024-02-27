import {Button, Loader, Table} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './DataPage.css';
import {DataSource, listDataSources} from '../../utils/data-source.js';

export function DataPage() {
  return (
    <Layout>
      <div className="DataPage">
        <div className="DataPage__header">
          <Heading size="h1">Data Sources</Heading>
          <Text as="p">Add a data source to sync data from Google Sheets.</Text>
          <div className="DataPage__header__buttons">
            <Button component="a" color="blue" size="xs" href="/cms/data/new">
              Add data source
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
  const headers = ['id', 'description', 'type', 'url'];

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
                  <div className="DataPage__DataSourcesTable__colWithButtons">
                    <div className="DataPage__DataSourcesTable__colWithButtons__label">
                      never
                    </div>
                    <div className="DataPage__DataSourcesTable__colWithButtons__buttons">
                      <Button variant="light" color="blue" size="xs" compact>
                        sync
                      </Button>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="DataPage__DataSourcesTable__colWithButtons">
                    <div className="DataPage__DataSourcesTable__colWithButtons__label">
                      never
                    </div>
                    <div className="DataPage__DataSourcesTable__colWithButtons__buttons">
                      <Button variant="light" color="blue" size="xs" compact>
                        publish
                      </Button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
};
