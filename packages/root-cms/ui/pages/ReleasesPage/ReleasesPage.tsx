import {Button, Loader, Switch, Table} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {ReleaseStatusBadge} from '../../components/ReleaseStatusBadge/ReleaseStatusBadge.js';
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
            Create a release for publishing content in a batch.
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
  const [includeArchived, setIncludeArchived] = useState(false);

  async function init() {
    setLoading(true);
    const releases = await listReleases({includeArchived});
    setTableData(releases);
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, [includeArchived]);

  return (
    <div className="ReleasesPage__ReleasesTable">
      {loading && <Loader color="gray" size="xl" />}
      {tableData.length > 0 && (
        <Table verticalSpacing="xs" striped highlightOnHover fontSize="xs">
          <thead>
            <tr>
              <th>id</th>
              <th>description</th>
              <th>content</th>
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((release) => (
              <tr
                key={release.id}
                className={release.archivedAt ? 'ReleasesPage__row--archived' : ''}
              >
                <td>
                  <a href={`/cms/releases/${release.id}`}>{release.id}</a>
                </td>
                <td>{release.description || ''}</td>
                <td>
                  {(release.docIds || []).map((docId) => (
                    <div>
                      <a href={`/cms/content/${docId}`}>{docId}</a>
                    </div>
                  ))}
                </td>
                <td>
                  <div className="ReleasesPage__ReleasesTable__publishStatus">
                    <ReleaseStatusBadge release={release} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="ReleasesPage__ReleasesTable__controls">
        <Switch
          size="md"
          checked={includeArchived}
          onChange={(event) => setIncludeArchived(event.currentTarget.checked)}
          label="Show archived"
        />
      </div>
    </div>
  );
};
