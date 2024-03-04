import {Button, Loader, Table} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import {Release, listReleases} from '../../utils/release.js';
import './ReleasesPage.css';

export function ReleasesPage() {
  return (
    <Layout>
      <div className="ReleasesPage">
        <div className="ReleasesPage__header">
          <Heading size="h1">Releases</Heading>
          <Text as="p">
            Create a release for publishing a group of docs together in a batch.
          </Text>
          <div className="ReleasesPage__header__buttons">
            <Button
              component="a"
              color="blue"
              size="xs"
              href="/cms/releases/new"
            >
              New release
            </Button>
          </div>
        </div>
        <ReleasesPage.ReleasesTable />
      </div>
    </Layout>
  );
}

ReleasesPage.ReleasesTable = () => {
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Release[]>([]);

  async function init() {
    const releases = await listReleases();
    setTableData(releases);
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
              <th>scheduled?</th>
              <th>published?</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((release) => (
              <tr key={release.id}>
                <td>
                  <a href={`/cms/releases/${release.id}`}>{release.id}</a>
                </td>
                <td>{release.description || ''}</td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
};
