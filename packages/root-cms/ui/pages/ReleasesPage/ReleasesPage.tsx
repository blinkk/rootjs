import './ReleasesPage.css';

import {Button, Loader, SegmentedControl, Table} from '@mantine/core';
import {
  IconCalendarTime,
  IconFilePlus,
  IconRocket,
  IconStack2,
} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Heading} from '../../components/Heading/Heading.js';
import {ReleaseStatusBadge} from '../../components/ReleaseStatusBadge/ReleaseStatusBadge.js';
import {Surface} from '../../components/Surface/Surface.js';
import {Text} from '../../components/Text/Text.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {Layout} from '../../layout/Layout.js';
import {notifyErrors} from '../../utils/notifications.js';
import {testCanPublish} from '../../utils/permissions.js';
import {Release, listReleases} from '../../utils/release.js';
import {withTimeout} from '../../utils/with-timeout.js';

type ReleaseListFilter = 'active' | 'unpublished' | 'published' | 'archived';

export function ReleasesPage() {
  usePageTitle('Releases');
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);

  return (
    <Layout>
      <div className="ReleasesPage">
        <div className="ReleasesPage__header">
          <Heading size="h1">Releases</Heading>
          <Text as="p">
            Bundle one or more documents and publish them together. Schedule a
            release to go live at a specific time, or publish manually when
            you're ready.
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
        <ReleasesPage.ReleasesTable canPublish={canPublish} />
      </div>
    </Layout>
  );
}

ReleasesPage.ReleasesTable = (props: {canPublish: boolean}) => {
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Release[]>([]);
  const [filter, setFilter] = useState<ReleaseListFilter>('active');

  async function init() {
    await notifyErrors(async () => {
      const releases = await withTimeout(
        listReleases(),
        undefined,
        'loading releases'
      );
      setTableData(releases);
    });
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
      {!loading && tableData.length === 0 && (
        <ReleasesPage.EmptyState canPublish={props.canPublish} />
      )}
      {!loading && tableData.length > 0 && (
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
            <Surface>
              <Table
                className="ReleasesPage__ReleasesTable__table"
                verticalSpacing="xs"
                striped
                highlightOnHover
                fontSize="xs"
              >
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
            </Surface>
          )}
          {filteredReleases.length === 0 && (
            <Surface>
              <Text
                className="ReleasesPage__ReleasesTable__noResults"
                size="body-sm"
                color="gray"
              >
                No {filter === 'active' ? '' : `${filter} `}releases.
              </Text>
            </Surface>
          )}
        </>
      )}
    </div>
  );
};

/** A single step in the empty state's "how it works" list. */
interface EmptyStateStep {
  icon: ComponentChildren;
  title: string;
  description: string;
}

const EMPTY_STATE_STEPS: EmptyStateStep[] = [
  {
    icon: <IconStack2 size={20} stroke={1.5} />,
    title: 'Create a release',
    description: 'Give it an id and a short description of what it ships.',
  },
  {
    icon: <IconFilePlus size={20} stroke={1.5} />,
    title: 'Add documents',
    description: 'Pick the docs and data sources that should go live together.',
  },
  {
    icon: <IconCalendarTime size={20} stroke={1.5} />,
    title: 'Publish or schedule',
    description: 'Publish everything at once, or schedule it for a set time.',
  },
];

/** Shown in place of the releases table when a project has no releases. */
ReleasesPage.EmptyState = (props: {canPublish: boolean}) => {
  return (
    <Surface className="ReleasesPage__EmptyState">
      <div className="ReleasesPage__EmptyState__icon">
        <IconRocket size={32} stroke={1.5} />
      </div>
      <Heading size="h2" className="ReleasesPage__EmptyState__title">
        No releases yet
      </Heading>
      <Text
        as="p"
        size="body-sm"
        color="gray"
        className="ReleasesPage__EmptyState__description"
      >
        Releases group changes across multiple documents so they go live
        together, either right away or at a scheduled time.
      </Text>
      <ol className="ReleasesPage__EmptyState__steps">
        {EMPTY_STATE_STEPS.map((step, i) => (
          <li className="ReleasesPage__EmptyState__step" key={step.title}>
            <div className="ReleasesPage__EmptyState__step__icon">
              {step.icon}
            </div>
            <div className="ReleasesPage__EmptyState__step__body">
              <Text size="body-sm" weight="semi-bold">
                {i + 1}. {step.title}
              </Text>
              <Text size="body-sm" color="gray">
                {step.description}
              </Text>
            </div>
          </li>
        ))}
      </ol>
      <ConditionalTooltip
        label="You don't have access to create new releases"
        condition={!props.canPublish}
      >
        <Button
          component="a"
          color="blue"
          size="sm"
          href="/cms/releases/new"
          disabled={!props.canPublish}
          style={!props.canPublish ? {pointerEvents: 'none'} : undefined}
        >
          Create your first release
        </Button>
      </ConditionalTooltip>
    </Surface>
  );
};
