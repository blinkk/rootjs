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
import {
  Pagination,
  PaginationSummary,
} from '../../../../components/Pagination/Pagination.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {Text} from '../../../../components/Text/Text.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {usePagination} from '../../../../hooks/usePagination.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {SegmentedControl} from '../../../../primitives/SegmentedControl/SegmentedControl.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {cn} from '../../../../utils/classes.js';
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
      <div className="ReleasesPage bg-page p-page">
        <div className="ReleasesPage__header mb-8 flex max-w-7xl flex-wrap items-start gap-4">
          <div className="ReleasesPage__headerText min-w-0 grow basis-100">
            <Heading size="h1">Releases</Heading>
            <Text as="p" className="mb-0 mt-2 max-w-prose">
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
              variant="primary"
              icon={<IconPlus />}
              href="/cms/releases/new"
              disabled={!canPublish}
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

/** Number of releases to display per page. */
const PAGE_SIZE = 25;

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

/**
 * Body cell classes: a table cell from `md` up, and a plain block in the
 * stacked rows below it.
 */
const CELL_CLASSES =
  'ReleasesPage__cell block p-0 md:table-cell md:border-0 md:border-b md:border-solid md:border-surface-active md:px-4 md:py-3 md:align-top md:group-last/row:border-b-0 md:group-hover/row:bg-surface-hover';

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

  // Paginate filtered releases, resetting to the first page when the filter
  // changes.
  const pagination = usePagination(filteredReleases, {
    pageSize: PAGE_SIZE,
    resetDeps: [filter],
  });

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
    <div className="ReleasesPage__releases max-w-7xl">
      {loading && <Spinner size="lg" className="text-muted" />}
      {!loading && tableData.length === 0 && (
        <ReleasesPage.EmptyState canPublish={props.canPublish} />
      )}
      {!loading && tableData.length > 0 && (
        <>
          <div className="ReleasesPage__filters mb-4">
            <SegmentedControl
              aria-label="Release filters"
              size="md"
              value={filter}
              onValueChange={(value) => setFilter(value)}
              data={FILTER_OPTIONS.map((option) => ({
                value: option.value,
                label: (
                  <span className="ReleasesPage__filter flex items-center justify-center gap-1.5 whitespace-nowrap">
                    {option.label}
                    <span className="ReleasesPage__filterCount rounded-full bg-chip px-1.5 text-xs leading-4 text-muted">
                      {filterCounts[option.value] ?? 0}
                    </span>
                  </span>
                ),
              }))}
            />
          </div>
          {filteredReleases.length > 0 && (
            <Surface className="ReleasesPage__tableSurface rounded-xl">
              {/*
               * Below `md` the table collapses into stacked rows: the release,
               * its status and author, then its contents.
               */}
              <table className="ReleasesPage__table w-full border-collapse text-sm text-fg max-md:block">
                <thead className="max-md:hidden">
                  <tr>
                    {['Release', 'Contents', 'Created by', 'Status'].map(
                      (label) => (
                        <th
                          key={label}
                          className="ReleasesPage__th whitespace-nowrap border-0 border-b border-solid border-border bg-surface-hover px-4 py-2.5 text-left text-sm font-medium text-muted"
                        >
                          {label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="max-md:block">
                  {pagination.pageItems.map((release) => (
                    <tr
                      key={release.id}
                      className="ReleasesPage__row group/row max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:border-0 max-md:border-b max-md:border-solid max-md:border-surface-active max-md:p-4 max-md:last:border-b-0"
                    >
                      <td className={cn(CELL_CLASSES, 'max-md:w-full')}>
                        <ReleasesPage.ReleaseCell release={release} />
                      </td>
                      <td
                        className={cn(
                          CELL_CLASSES,
                          'max-md:order-last max-md:w-full'
                        )}
                      >
                        <ReleasesPage.ContentsCell release={release} />
                      </td>
                      <td
                        className={cn(
                          CELL_CLASSES,
                          'max-md:min-w-0 max-md:flex-1'
                        )}
                      >
                        {release.createdBy ? (
                          <div className="ReleasesPage__createdBy flex min-w-0 items-center gap-2 whitespace-nowrap">
                            <UserAvatar
                              email={release.createdBy}
                              size={24}
                              withTooltip={false}
                            />
                            <UserTag email={release.createdBy} />
                          </div>
                        ) : (
                          <span className="ReleasesPage__empty text-muted">
                            —
                          </span>
                        )}
                      </td>
                      <td className={CELL_CLASSES}>
                        <div className="ReleasesPage__publishStatus flex items-center gap-1.5">
                          <ReleaseStatusBadge release={release} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Surface>
          )}
          {pagination.totalPages > 1 && (
            <div className="ReleasesPage__footer mt-4 flex flex-wrap items-center justify-between gap-3">
              <PaginationSummary
                start={pagination.start}
                end={pagination.end}
                total={pagination.totalItems}
                noun="release"
              />
              <Pagination
                className="py-0"
                total={pagination.totalPages}
                page={pagination.page}
                onChange={pagination.setPage}
              />
            </div>
          )}
          {filteredReleases.length === 0 && (
            <Surface>
              <Text
                className="ReleasesPage__noResults px-5 py-10 text-center"
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
      className="ReleasesPage__release group block min-w-0 text-fg no-underline"
      href={`/cms/releases/${release.id}`}
    >
      <div className="ReleasesPage__releaseTitle text-base font-semibold text-strong wrap-anywhere underline-offset-3 group-hover:underline">
        {release.description || release.id}
      </div>
      {release.description && (
        <div className="ReleasesPage__releaseId mt-0.5 font-mono text-sm text-muted wrap-anywhere">
          {release.id}
        </div>
      )}
    </a>
  );
};

/** Classes shared by the doc, data source and "more" chips. */
const CHIP_CLASSES =
  'inline-flex h-6 max-w-60 items-center gap-1 whitespace-nowrap rounded-md px-2 text-sm';

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
    return <span className="ReleasesPage__empty text-muted">—</span>;
  }
  const collapsed = !expanded && items.length > CONTENTS_CHIP_LIMIT;
  const visibleItems = collapsed
    ? items.slice(0, CONTENTS_CHIP_LIMIT - 1)
    : items;
  return (
    <div className="ReleasesPage__contents flex max-w-105 flex-wrap gap-1">
      {visibleItems.map((item) => (
        <a
          className={cn(
            'ReleasesPage__chip',
            item.isDataSource && 'ReleasesPage__chip--dataSource',
            CHIP_CLASSES,
            'font-mono no-underline',
            item.isDataSource
              ? 'bg-success-soft text-success hover:brightness-95'
              : 'bg-surface-hover text-fg hover:bg-surface-active'
          )}
          href={item.href}
          title={item.id}
          key={item.href}
        >
          {item.isDataSource && (
            <IconDatabase
              className="shrink-0"
              size={12}
              stroke={2}
              aria-label="Data source"
            />
          )}
          <span className="ReleasesPage__chipLabel truncate">{item.id}</span>
        </a>
      ))}
      {items.length > CONTENTS_CHIP_LIMIT && (
        <button
          className={cn(
            'ReleasesPage__chip ReleasesPage__chip--more',
            CHIP_CLASSES,
            'm-0 cursor-pointer appearance-none border border-dashed border-border-strong bg-surface font-sans font-medium text-muted hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
          )}
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
    <Surface className="ReleasesPage__emptyState flex flex-col items-center px-4 py-12 text-center md:px-6">
      <div className="ReleasesPage__emptyStateIcon mb-4 flex size-16 items-center justify-center rounded-full bg-info-soft text-info">
        <IconRocket size={32} stroke={1.5} />
      </div>
      <Heading size="h2" className="ReleasesPage__emptyStateTitle">
        No releases yet
      </Heading>
      <Text
        as="p"
        size="body-sm"
        color="gray"
        className="ReleasesPage__emptyStateDescription mx-auto mb-0 mt-2 max-w-md"
      >
        Releases group changes across multiple documents so they go live
        together, either right away or at a scheduled time.
      </Text>
      <ol className="ReleasesPage__steps mx-0 my-8 grid w-full max-w-190 list-none grid-cols-1 gap-4 p-0 text-left md:grid-cols-3">
        {EMPTY_STATE_STEPS.map((step, i) => (
          <li
            className="ReleasesPage__step flex gap-3 rounded-lg border border-solid border-border p-4"
            key={step.title}
          >
            <div className="ReleasesPage__stepIcon shrink-0 text-muted">
              {step.icon}
            </div>
            <div className="ReleasesPage__stepBody flex flex-col gap-1">
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
          variant="blue"
          size="md"
          href="/cms/releases/new"
          disabled={!props.canPublish}
        >
          Create your first release
        </Button>
      </ConditionalTooltip>
    </Surface>
  );
};
