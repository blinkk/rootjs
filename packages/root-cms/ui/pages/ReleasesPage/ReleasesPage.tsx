import './ReleasesPage.css';

import {Button, Loader, SegmentedControl, Table} from '@mantine/core';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Heading} from '../../components/Heading/Heading.js';
import {ReleaseStatusBadge} from '../../components/ReleaseStatusBadge/ReleaseStatusBadge.js';
import {Text} from '../../components/Text/Text.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {Layout} from '../../layout/Layout.js';
import {testCanPublish} from '../../utils/permissions.js';
import {Release, listReleases} from '../../utils/release.js';

type ReleaseListFilter = 'active' | 'unpublished' | 'published' | 'archived';

export function ReleasesPage() {
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);

  return (
    <Layout>
      <div className="ReleasesPage">
        <div className="ReleasesPage__header">
          <Heading size="h1">Releases</Heading>
          <Text as="p">
            Create a release for publishing content in a batch.
          </Text>
          <div className="ReleasesPage__header__buttons">
            <ConditionalTooltip
              label="You don't have access to create new releases"
              condition={!canPublish}
            >
              <Button
                component="a"
                color="blue"
                size="xs"
                href="/cms/releases/new"
                disabled={!canPublish}
                style={!canPublish ? {pointerEvents: 'none'} : undefined}
              >
                New release
              </Button>
            </ConditionalTooltip>
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
  const [filter, setFilter] = useState<ReleaseListFilter>('active');

  async function init() {
    const releases = await listReleases();
    setTableData(releases);
    setLoading(false);
  }

  const filteredReleases = useMemo(() => {
    return tableData.filter((release) => {
      const isArchived = Boolean(release.archivedAt);
      const isPublished = Boolean(release.publishedAt);
      if (filter === 'active') {
        return !isArchived;
      }
      if (filter === 'unpublished') {
        return !isArchived && !isPublished;
      }
      if (filter === 'published') {
        return !isArchived && isPublished;
      }
      return isArchived;
    });
  }, [tableData, filter]);

  useEffect(() => {
    init();
  }, []);

  return (
    <div className="ReleasesPage__ReleasesTable">
      {loading && <Loader color="gray" size="xl" />}
      {!loading && (
        <>
          <div className="ReleasesPage__ReleasesTable__filters">
            <SegmentedControl
              size="sm"
              value={filter}
              onChange={(value: ReleaseListFilter) => setFilter(value)}
              data={[
                {label: 'Active', value: 'active'},
                {label: 'Unpublished', value: 'unpublished'},
                {label: 'Published', value: 'published'},
                {label: 'Archived', value: 'archived'},
              ]}
            />
          </div>
          {filteredReleases.length > 0 && (
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
                {filteredReleases.map((release) => (
                  <tr key={release.id}>
                    <td>
                      <a href={`/cms/releases/${release.id}`}>{release.id}</a>
                    </td>
                    <td>{release.description || ''}</td>
                    <td>
                      {(release.docIds || []).map((docId) => (
                        <div key={docId}>
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
          {filteredReleases.length === 0 && (
            <Text as="p">No releases found for this filter.</Text>
          )}
        </>
      )}
    </div>
  );
};
