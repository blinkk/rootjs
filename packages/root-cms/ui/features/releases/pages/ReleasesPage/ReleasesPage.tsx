import './ReleasesPage.css';

import {Button, Loader, SegmentedControl} from '@mantine/core';
import {
  IconCalendarTime,
  IconDatabase,
  IconFilePlus,
  IconPlus,
  IconRocket,
  IconStack2,
} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {Layout} from '../../../../app/layout/Layout.js';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {Text} from '../../../../components/Text/Text.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {joinClassNames} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {UserAvatar} from '../../../users/UserAvatar/UserAvatar.js';
import {UserTag} from '../../../users/UserTag/UserTag.js';
import {ReleaseStatusBadge} from '../../components/ReleaseStatusBadge/ReleaseStatusBadge.js';
import {Release, listReleases} from '../../release.js';

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
          <div className="ReleasesPage__header__text">
            <Heading size="h1">Releases</Heading>
            <Text as="p">
              Bundle one or more documents and publish them together. Schedule a
              release to go live at a specific time, or publish manually when
              you're ready.
            </Text>
          </div>
          <ConditionalTooltip
            label="You don't have access to create new releases"
            condition={!canPublish}
          >
            <Button
              component="a"
              color="dark"
              size="xs"
              leftIcon={<IconPlus size={16} />}
              href="/cms/releases/new"
              disabled={!canPublish}
              style={!canPublish ? {pointerEvents: 'none'} : undefined}
            >
              New release
            </Button>
          </ConditionalTooltip>
        </div>
        <ReleasesPage.ReleasesTable canPublish={canPublish} />
      </div>
    </Layout>
  );
}

const FILTER_OPTIONS: Array<{label: string; value: ReleaseListFilter}> = [
  {label: 'Active', value: 'active'},
  {label: 'Unpublished', value: 'unpublished'},
  {label: 'Published', value: 'published'},
  {label: 'Archived', value: 'archived'},
];

function testMatchesFilter(release: Release, filter: ReleaseListFilter) {
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
}

ReleasesPage.ReleasesTable = (props: {canPublish: boolean}) => {
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Release[]>([]);
  const [storedFilter, setFilter] = useLocalStorage<ReleaseListFilter>(
    'root-cms-releases-filter',
    'active'
  );
  // Fall back to the default if the stored value is no longer a valid filter.
  const filter = FILTER_OPTIONS.some((option) => option.value === storedFilter)
    ? storedFilter
    : 'active';

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
    return tableData.filter((release) => testMatchesFilter(release, filter));
  }, [tableData, filter]);

  const filterCounts = useMemo(() => {
    const counts: Partial<Record<ReleaseListFilter, number>> = {};
    FILTER_OPTIONS.forEach((option) => {
      counts[option.value] = tableData.filter((release) =>
        testMatchesFilter(release, option.value)
      ).length;
    });
    return counts;
  }, [tableData]);

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
              aria-label="Release filters"
              size="sm"
              value={filter}
              onChange={(value: ReleaseListFilter) => setFilter(value)}
              data={FILTER_OPTIONS.map((option) => ({
                value: option.value,
                label: (
                  <span className="ReleasesPage__ReleasesTable__filter">
                    {option.label}
                    <span className="ReleasesPage__ReleasesTable__filter__count">
                      {filterCounts[option.value] ?? 0}
                    </span>
                  </span>
                ),
              }))}
            />
          </div>
          {filteredReleases.length > 0 && (
            <Surface className="ReleasesPage__ReleasesTable__surface">
              <table className="ReleasesPage__ReleasesTable__table">
                <thead>
                  <tr>
                    <th>Release</th>
                    <th>Contents</th>
                    <th>Created by</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReleases.map((release) => (
                    <tr key={release.id}>
                      <td>
                        <ReleasesPage.ReleaseCell release={release} />
                      </td>
                      <td>
                        <ReleasesPage.ContentsCell release={release} />
                      </td>
                      <td>
                        {release.createdBy ? (
                          <div className="ReleasesPage__ReleasesTable__createdBy">
                            <UserAvatar
                              email={release.createdBy}
                              size={24}
                              withTooltip={false}
                            />
                            <UserTag email={release.createdBy} />
                          </div>
                        ) : (
                          <span className="ReleasesPage__ReleasesTable__empty">
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="ReleasesPage__ReleasesTable__publishStatus">
                          <ReleaseStatusBadge release={release} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

/** The release's description (or id) and id, linking to the release page. */
ReleasesPage.ReleaseCell = (props: {release: Release}) => {
  const release = props.release;
  return (
    <a
      className="ReleasesPage__ReleasesTable__release"
      href={`/cms/releases/${release.id}`}
    >
      <div className="ReleasesPage__ReleasesTable__release__title">
        {release.description || release.id}
      </div>
      {release.description && (
        <div className="ReleasesPage__ReleasesTable__release__id">
          {release.id}
        </div>
      )}
    </a>
  );
};

/** Max number of chips to show before collapsing the rest. */
const CONTENTS_CHIP_LIMIT = 6;

/**
 * Lists a release's data sources and docs as chips. Long lists collapse to the
 * first few chips plus a "+N more" chip that expands the rest.
 */
ReleasesPage.ContentsCell = (props: {release: Release}) => {
  const [expanded, setExpanded] = useState(false);
  const items = [
    ...(props.release.dataSourceIds || []).map((id) => ({
      id,
      href: `/cms/data/${id}`,
      isDataSource: true,
    })),
    ...(props.release.docIds || []).map((id) => ({
      id,
      href: `/cms/content/${id}`,
      isDataSource: false,
    })),
  ];
  if (items.length === 0) {
    return <span className="ReleasesPage__ReleasesTable__empty">—</span>;
  }
  const collapsed = !expanded && items.length > CONTENTS_CHIP_LIMIT;
  const visibleItems = collapsed
    ? items.slice(0, CONTENTS_CHIP_LIMIT - 1)
    : items;
  return (
    <div className="ReleasesPage__contents">
      {visibleItems.map((item) => (
        <a
          className={joinClassNames(
            'ReleasesPage__contents__chip',
            item.isDataSource && 'ReleasesPage__contents__chip--dataSource'
          )}
          href={item.href}
          title={item.id}
          key={item.href}
        >
          {item.isDataSource && (
            <IconDatabase size={12} stroke={2} aria-label="Data source" />
          )}
          <span className="ReleasesPage__contents__chip__label">{item.id}</span>
        </a>
      ))}
      {items.length > CONTENTS_CHIP_LIMIT && (
        <button
          className="ReleasesPage__contents__chip ReleasesPage__contents__chip--more"
          type="button"
          onClick={() => setExpanded(!expanded)}
        >
          {collapsed
            ? `+${items.length - visibleItems.length} more`
            : 'Show less'}
        </button>
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
