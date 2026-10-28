import './ReleasePage.css';

import {
  IconDatabase,
  IconFile,
  IconListSearch,
  IconRobot,
  IconSettings,
  IconSparkles,
} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {ChangeEvent} from 'preact/compat';
import {useCallback, useEffect, useMemo, useState} from 'preact/hooks';
import {Layout} from '../../../../app/layout/Layout.js';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Markdown} from '../../../../components/Markdown/Markdown.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {Text} from '../../../../components/Text/Text.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {useStringParam} from '../../../../hooks/useQueryParam.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Checkbox} from '../../../../primitives/Checkbox/Checkbox.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {SegmentedControl} from '../../../../primitives/SegmentedControl/SegmentedControl.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {
  showNotification,
  updateNotification,
} from '../../../../primitives/Toast/toastStore.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {errorMessage, notifyErrors} from '../../../../utils/notifications.js';
import {getNestedValue} from '../../../../utils/objects.js';
import {getTimeAgo} from '../../../../utils/time.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {testAiEnabled} from '../../../ai/ai.js';
import {
  RootAIChat,
  RootAIChatPrompt,
} from '../../../ai/components/RootAIChat/RootAIChat.js';
import {DataSource, getDataSource} from '../../../data-sources/data-source.js';
import {DocDiffViewer} from '../../../documents/components/DocDiffViewer/DocDiffViewer.js';
import {
  DocStatusBadges,
  StatusBadge,
} from '../../../documents/components/DocStatusBadges/DocStatusBadges.js';
import {testTimestamp, toMillis} from '../../../documents/doc-changes.js';
import {CMSDoc} from '../../../documents/doc.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {UserActionTooltip} from '../../../users/UserActionTooltip/UserActionTooltip.js';
import {ReleaseStatusBadge} from '../../components/ReleaseStatusBadge/ReleaseStatusBadge.js';
import {useScheduleReleaseModal} from '../../components/ScheduleReleaseModal/ScheduleReleaseModal.js';
import {testHasPublishChecks} from '../../publish-checks.js';
import {
  ReleaseDiff,
  ReleaseDocDiff,
  ReleaseDocDiffStatus,
  getReleaseDiff,
  getReleaseDiffLabels,
} from '../../release-diff.js';
import {
  ReleaseRollbackConflict,
  getReleaseRollbackPlan,
} from '../../release-rollback.js';
import {
  Release,
  cancelScheduledRelease,
  getRelease,
  publishRelease,
  rollbackRelease,
} from '../../release.js';
import {
  usePublishChecks,
  type PublishChecksDecision,
} from '../../usePublishChecks.js';

type ReleasePageTab = 'overview' | 'changes';

const SUMMARIZE_PROMPT =
  'Summarize the changes in this release as a short bulleted list, grouped ' +
  'by doc. Point out anything that looks unintentional.';

const AUDIT_PROMPT =
  'Audit the changes in this release. Flag anything that looks ' +
  'unintentional or risky, such as placeholder or test content, typos, ' +
  'broken or empty links, removed content, locale changes, or edits that ' +
  "don't match the release description. Also note who modified each doc.";

const SUGGESTED_PROMPTS = [
  'Summarize the changes in this release',
  'Does this release have any unintentional changes?',
  'Who modified the docs in this release?',
];

export function ReleasePage(props: {id: string}) {
  const [loading, setLoading] = useState(true);
  const [release, setRelease] = useState<Release | null>(null);
  const [diff, setDiff] = useState<ReleaseDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(true);
  const [tabParam, setTabParam] = useStringParam('tab', 'overview');
  const tab: ReleasePageTab = tabParam === 'changes' ? 'changes' : 'overview';
  const id = props.id;
  usePageTitle(`Release: ${id}`);

  const aiEnabled = testAiEnabled();
  const [aiVisible, setAiVisible] = useLocalStorage<boolean>(
    'root::ReleasePage::aiVisible',
    false
  );
  const [aiPrompt, setAiPrompt] = useState<RootAIChatPrompt | undefined>();
  // The prompt is cleared on close so that reopening the panel doesn't send
  // it again.
  const closeAi = useCallback(() => {
    setAiPrompt(undefined);
    setAiVisible(() => false);
  }, [setAiVisible]);

  /** Opens the Root AI panel and sends a prompt to it. */
  function askAi(text: string) {
    setAiPrompt({id: Date.now(), text});
    setAiVisible(() => true);
  }

  async function init() {
    setLoading(true);
    let release: Release | null = null;
    await notifyErrors(async () => {
      release = await withTimeout(
        getRelease(id),
        undefined,
        'loading the release'
      );
      setRelease(release);
    });
    setLoading(false);
    if (release) {
      await loadDiff(release);
    } else {
      setDiffLoading(false);
    }
  }

  async function loadDiff(release: Release) {
    setDiffLoading(true);
    await notifyErrors(async () => {
      const diff = await withTimeout(
        getReleaseDiff(release),
        undefined,
        'loading the release changes'
      );
      setDiff(diff);
    });
    setDiffLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  function onAction(action: string) {
    console.log('onAction()', action);
    init();
  }

  const numChanged = diff
    ? diff.docs.filter((doc) => doc.status !== 'unchanged').length
    : 0;

  return (
    <Layout>
      {/* Only the page and the AI panel scroll, not the layout around them. */}
      <div className="ReleasePage__layout relative flex overflow-hidden">
        <div className="ReleasePage min-w-0 flex-1 overflow-auto bg-page p-page">
          <div className="ReleasePage__header mb-5">
            <Breadcrumbs
              className="ReleasePage__breadcrumbs mb-3"
              items={[{label: 'Releases', href: '/cms/releases'}, {label: id}]}
            />
            <div className="ReleasePage__titleWrap flex flex-wrap items-center gap-3">
              <Heading size="h1" className="min-w-0 wrap-anywhere">
                {id}
              </Heading>
              {release && <ReleaseStatusBadge release={release} />}
              <div className="ReleasePage__headerActions flex flex-wrap items-start gap-2 md:ml-auto">
                <IconButton
                  className="ReleasePage__configure"
                  label="Configure"
                  variant="default"
                  href={`/cms/releases/${props.id}/edit`}
                >
                  <IconSettings stroke="1.5" />
                </IconButton>
                {aiEnabled && (
                  <Button
                    className="ReleasePage__aiToggle aria-pressed:bg-surface-active"
                    icon={<IconRobot />}
                    aria-pressed={aiVisible}
                    onClick={() =>
                      aiVisible ? closeAi() : setAiVisible(() => true)
                    }
                  >
                    Root AI
                  </Button>
                )}
                {release && (
                  <ReleasePage.Actions release={release} onAction={onAction} />
                )}
              </div>
            </div>
            {release?.description && (
              <Markdown
                className="ReleasePage__description mt-2 max-w-200"
                code={release.description}
              />
            )}
            {release && (
              <Text
                className="ReleasePage__meta mt-2"
                size="body-sm"
                color="gray"
              >
                {getReleaseMeta(release)}
              </Text>
            )}
          </div>
          <SegmentedControl
            className="ReleasePage__tabs mb-5"
            aria-label="Release views"
            size="md"
            value={tab}
            onValueChange={(value) => setTabParam(value)}
            data={[
              {label: 'Overview', value: 'overview'},
              {
                label: (
                  <span className="ReleasePage__tabLabel flex items-center gap-1.5">
                    Changes
                    {diff && (
                      <span className="ReleasePage__tabCount rounded-lg bg-chip px-1.5 text-sm font-medium">
                        {numChanged}
                      </span>
                    )}
                  </span>
                ),
                value: 'changes',
              },
            ]}
          />

          {loading ? (
            <Spinner size="lg" className="text-muted" />
          ) : release ? (
            tab === 'overview' ? (
              <ReleasePage.Overview
                release={release}
                diff={diff}
                diffLoading={diffLoading}
                onSummarize={
                  aiEnabled ? () => askAi(SUMMARIZE_PROMPT) : undefined
                }
                onAudit={aiEnabled ? () => askAi(AUDIT_PROMPT) : undefined}
              />
            ) : (
              <ReleasePage.Changes
                release={release}
                diff={diff}
                diffLoading={diffLoading}
              />
            )
          ) : null}
        </div>
        {aiEnabled && aiVisible && (
          <ReleasePageAiPanel
            releaseId={id}
            prompt={aiPrompt}
            onClose={closeAi}
          />
        )}
      </div>
    </Layout>
  );
}

/** Returns e.g. "Created by jane@example.com 2 days ago · 5 docs". */
function getReleaseMeta(release: Release): string {
  const parts: string[] = [];
  if (release.createdBy) {
    let created = `Created by ${release.createdBy}`;
    if (testTimestamp(release.createdAt)) {
      created += ` ${formatTimeAgo(release.createdAt)}`;
    }
    parts.push(created);
  }
  const numDocs = release.docIds?.length || 0;
  parts.push(numDocs === 1 ? '1 doc' : `${numDocs} docs`);
  const numDataSources = release.dataSourceIds?.length || 0;
  if (numDataSources > 0) {
    parts.push(
      numDataSources === 1 ? '1 data source' : `${numDataSources} data sources`
    );
  }
  return parts.join(' · ');
}

interface ReleasePageAiPanelProps {
  releaseId: string;
  prompt?: RootAIChatPrompt;
  onClose: () => void;
}

/** Renders the Root AI panel, with the chat scoped to the release. */
function ReleasePageAiPanel(props: ReleasePageAiPanelProps) {
  const releaseContext = useMemo(
    () => ({releaseId: props.releaseId}),
    [props.releaseId]
  );
  return (
    <div className="ReleasePage__ai overflow-hidden bg-surface max-md:absolute max-md:inset-0 max-md:z-(--cms-z-sticky) md:w-105 md:shrink-0 md:border-0 md:border-l md:border-solid md:border-border">
      <RootAIChat
        variant="panel"
        releaseContext={releaseContext}
        prompt={props.prompt}
        suggestedPrompts={SUGGESTED_PROMPTS}
        onClose={props.onClose}
      />
    </div>
  );
}

/**
 * The release's publishing actions: publish, schedule and rollback.
 */
ReleasePage.Actions = (props: {
  release: Release;
  onAction: (action: string) => void;
}) => {
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);

  const release = props.release;
  const [publishLoading, setPublishLoading] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [checksRunning, setChecksRunning] = useState(false);
  const [skipChecks, setSkipChecks] = useState(false);

  const modals = useModals();
  const publishChecks = usePublishChecks();
  const releaseHasChecks = testHasPublishChecks(release.docIds || []);
  const scheduleReleaseModal = useScheduleReleaseModal({
    releaseId: release.id,
    docIds: release.docIds || [],
    skipChecks: skipChecks,
    onScheduled: () => {
      props.onAction('scheduled');
    },
  });

  /**
   * Runs the publishing checks for every doc in the release and, if publishing
   * isn't halted, asks the user to confirm.
   */
  async function onPublishClicked() {
    const docIds = release.docIds || [];
    const dataSourceIds = release.dataSourceIds || [];
    const total = docIds.length + dataSourceIds.length;
    if (total === 0) {
      showNotification({
        title: 'Cannot publish release',
        message: 'Error: nothing in the release to publish.',
        color: 'red',
        autoClose: false,
      });
      return;
    }

    let decision: PublishChecksDecision;
    try {
      setChecksRunning(true);
      decision = await publishChecks.run({
        docIds: docIds,
        actionLabel: 'Publish',
        skip: skipChecks,
      });
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Checks failed',
        message: `Failed to run publishing checks: ${errorMessage(err)}`,
        color: 'red',
        autoClose: false,
      });
      return;
    } finally {
      setChecksRunning(false);
    }
    // Publishing was halted by a failed required check.
    if (!decision.proceed) {
      return;
    }

    modals.openConfirmModal({
      title: `Publish release: ${release.id}`,
      children: (
        <>
          <Text size="body-sm" weight="semi-bold">
            Are you sure you want to publish this release? The {total} items in
            the release will go live immediately.
          </Text>
          {(decision.skipped || decision.bypassed) && (
            <Text size="body-sm" className="text-danger">
              {decision.skipped
                ? 'Publishing checks will be skipped.'
                : 'Failed required checks will be bypassed.'}
            </Text>
          )}
        </>
      ),
      labels: {confirm: 'Publish', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'dark', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: true,
      onConfirm: () => {
        publish(decision);
      },
    });
  }

  async function publish(decision: PublishChecksDecision) {
    setPublishLoading(true);
    await notifyErrors(async () => {
      const notificationId = `publish-release-${release.id}`;
      const numDocs = release.docIds?.length || 0;
      const numDataSources = release.dataSourceIds?.length || 0;
      const total = numDocs + numDataSources;
      showNotification({
        id: notificationId,
        title: 'Publishing release',
        message: `Publishing ${total} items...`,
        loading: true,
        autoClose: false,
      });
      await publishRelease(release.id, {
        checksAudit: decision.audit || undefined,
      });
      updateNotification({
        id: notificationId,
        title: 'Published release!',
        message: `Successfully published ${total} items!`,
        loading: false,
        autoClose: 5000,
      });
      if (props.onAction) {
        props.onAction('publish');
      }
      publishChecks.showWarnings(decision.results, {actionLabel: 'Publish'});
    });
    setPublishLoading(false);
  }

  /**
   * Checks whether any items in the release have changed since the release
   * was published and asks the user to confirm the rollback.
   */
  async function onRollbackClicked() {
    setRollbackLoading(true);
    let plan;
    try {
      plan = await getReleaseRollbackPlan(release.id);
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Cannot rollback release',
        message: `Failed to load rollback data: ${errorMessage(err)}`,
        color: 'red',
        autoClose: false,
      });
      return;
    } finally {
      setRollbackLoading(false);
    }
    if (plan.items.length === 0) {
      showNotification({
        title: 'Cannot rollback release',
        message:
          'No rollback data found. Releases published before rollbacks were supported cannot be rolled back.',
        color: 'red',
        autoClose: false,
      });
      return;
    }

    const conflicts = plan.conflicts;
    const numItems = plan.items.filter(
      (item) => item.snapshot.type !== 'translations'
    ).length;
    modals.openConfirmModal({
      title: `Rollback release: ${release.id}`,
      children: (
        <>
          <Text size="body-sm" weight="semi-bold">
            Are you sure you want to rollback this release? The {numItems} items
            in the release will be restored to their published state from before
            the release was published. Drafts are not changed.
          </Text>
          {conflicts.length > 0 && (
            <div className="ReleasePage__rollbackConflicts mt-3 rounded-sm border border-solid border-danger-line bg-danger-soft px-3 py-2.5">
              <Text size="body-sm" weight="semi-bold">
                Warning: the following items have been published or unpublished
                since the release was published. Rolling back will overwrite
                those changes.
              </Text>
              <ul className="mb-0 mt-2 max-h-50 overflow-y-auto pl-5">
                {conflicts.map((conflict) => (
                  <li key={rollbackConflictLabel(conflict)}>
                    <Text size="body-sm">
                      <code>{rollbackConflictLabel(conflict)}</code>{' '}
                      {rollbackConflictDetails(conflict)}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ),
      labels: {
        confirm: conflicts.length > 0 ? 'Rollback anyway' : 'Rollback',
        cancel: 'Cancel',
      },
      cancelProps: {size: 'xs'},
      confirmProps: {color: conflicts.length > 0 ? 'red' : 'dark', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: true,
      onConfirm: () => {
        rollback({force: conflicts.length > 0});
      },
    });
  }

  async function rollback(options: {force: boolean}) {
    setRollbackLoading(true);
    await notifyErrors(async () => {
      const notificationId = `rollback-release-${release.id}`;
      showNotification({
        id: notificationId,
        title: 'Rolling back release',
        message: `Rolling back ${release.id}...`,
        loading: true,
        autoClose: false,
      });
      await rollbackRelease(release.id, {force: options.force});
      updateNotification({
        id: notificationId,
        title: 'Rolled back release!',
        message: `Successfully rolled back ${release.id}.`,
        loading: false,
        autoClose: 5000,
      });
      props.onAction('rollback');
    });
    setRollbackLoading(false);
  }

  function onScheduleClicked() {
    scheduleReleaseModal.open();
  }

  async function onCancelScheduleClicked() {
    await cancelScheduledRelease(release.id);
    props.onAction('cancel-schedule');
  }

  return (
    <div className="ReleasePage__actions flex flex-col items-start gap-1.5 md:items-end">
      <div className="ReleasePage__actionButtons flex flex-wrap gap-2">
        {!release.archivedAt && !release.scheduledAt && release.publishedAt && (
          <ConditionalTooltip
            label="You don't have access to rollback this release"
            condition={!canPublish}
          >
            <Tooltip
              label="Restore the items in the release to their state before the release was published"
              placement="bottom"
              contentClassName="max-w-55"
              disabled={!canPublish}
            >
              <Button
                onClick={() => onRollbackClicked()}
                loading={rollbackLoading}
                disabled={!canPublish || publishLoading}
              >
                Rollback
              </Button>
            </Tooltip>
          </ConditionalTooltip>
        )}
        {!release.archivedAt &&
          (release.scheduledAt ? (
            <ConditionalTooltip
              label="You don't have access to manage scheduled releases"
              condition={!canPublish}
            >
              <Tooltip
                label="Cancel the scheduled release"
                placement="bottom"
                disabled={!canPublish}
              >
                <Button
                  onClick={() => onCancelScheduleClicked()}
                  disabled={!canPublish}
                >
                  Cancel schedule
                </Button>
              </Tooltip>
            </ConditionalTooltip>
          ) : (
            <ConditionalTooltip
              label="You don't have access to manage scheduled releases"
              condition={!canPublish}
            >
              <Tooltip
                label="Schedule the release to be published at a future date"
                placement="bottom"
                contentClassName="max-w-45"
                disabled={!canPublish}
              >
                <Button
                  onClick={() => onScheduleClicked()}
                  disabled={!canPublish}
                >
                  Schedule
                </Button>
              </Tooltip>
            </ConditionalTooltip>
          ))}
        {!release.archivedAt && !release.scheduledAt && (
          <ConditionalTooltip
            label="You don't have access to publish this release"
            condition={!canPublish}
          >
            <Tooltip
              label="Publish the release immediately"
              placement="bottom"
              disabled={!canPublish}
            >
              <Button
                variant="primary"
                onClick={() => onPublishClicked()}
                loading={publishLoading || checksRunning}
                disabled={!canPublish}
              >
                {checksRunning
                  ? 'Running checks'
                  : release.publishedAt
                    ? 'Re-publish'
                    : 'Publish'}
              </Button>
            </Tooltip>
          </ConditionalTooltip>
        )}
      </div>
      {!release.archivedAt && releaseHasChecks && publishChecks.isAdmin && (
        <Checkbox
          className="ReleasePage__skipChecks"
          label="Skip publishing checks (admins only)"
          checked={skipChecks}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setSkipChecks(e.currentTarget.checked);
          }}
        />
      )}
    </div>
  );
};

const DOC_DIFF_STATUS_LABELS: Record<ReleaseDocDiffStatus, string> = {
  added: 'New',
  removed: 'Deleted',
  modified: 'Modified',
  unchanged: 'No changes',
  missing: 'Not found',
};

/**
 * The overview tab: the docs and data sources in the release, plus details
 * about the release.
 */
ReleasePage.Overview = (props: {
  release: Release;
  diff: ReleaseDiff | null;
  diffLoading: boolean;
  onSummarize?: () => void;
  onAudit?: () => void;
}) => {
  const release = props.release;
  const docIds = release.docIds || [];
  const dataSourceIds = release.dataSourceIds || [];
  const dataSources = useDataSources(dataSourceIds);
  const isEmpty = docIds.length === 0 && dataSourceIds.length === 0;
  const docDiffs: Record<string, ReleaseDocDiff> = {};
  for (const doc of props.diff?.docs || []) {
    docDiffs[doc.docId] = doc;
  }

  return (
    <div className="ReleasePage__overview flex flex-wrap items-start gap-7">
      <div className="ReleasePage__overviewMain min-w-0 max-w-250 shrink grow-999 basis-140">
        <div className="ReleasePage__sectionHeader mb-4 flex h-8 items-center gap-4">
          <Heading size="h2">Contents</Heading>
          <Button size="xs" href={`/cms/releases/${release.id}/edit`}>
            Edit
          </Button>
        </div>
        {isEmpty ? (
          <Text size="body-sm" color="gray">
            Nothing has been added to this release yet.
          </Text>
        ) : (
          <Surface className="ReleasePage__contents">
            {/*
             * Below `md` the table collapses into stacked rows: the item, then
             * its status and when it was last modified.
             */}
            <table className="ReleasePage__contentsTable w-full border-collapse text-sm text-fg max-md:block">
              <thead className="max-md:hidden">
                <tr>
                  {['Item', 'Status', 'Last modified'].map((label) => (
                    <th
                      key={label}
                      className="ReleasePage__th whitespace-nowrap border-0 border-b border-solid border-border bg-surface-hover px-4 py-2.5 text-left text-sm font-medium text-muted"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="max-md:block">
                {docIds.map((docId) => (
                  <ReleasePage.ContentsDocRow
                    key={docId}
                    docId={docId}
                    docDiff={docDiffs[docId]}
                    loading={props.diffLoading}
                  />
                ))}
                {dataSourceIds.map((id) => (
                  <ReleasePage.ContentsDataSourceRow
                    key={id}
                    id={id}
                    dataSource={dataSources[id]}
                  />
                ))}
              </tbody>
            </table>
          </Surface>
        )}
      </div>
      {/* The sidebar is hidden until something is added to the release. */}
      {!isEmpty && (
        // The top padding aligns the cards with the top of the contents table.
        <div className="ReleasePage__overviewSide flex max-w-115 shrink grow basis-105 flex-col gap-4 md:pt-12">
          {props.onSummarize && props.onAudit && (
            <Surface className="ReleasePage__card flex flex-col gap-2.5 p-4">
              <div className="ReleasePage__cardTitle flex items-center gap-1.5 text-base font-semibold text-fg">
                <IconRobot size={16} />
                Root AI
              </div>
              <Text size="body-sm" color="gray">
                Get a summary of what this release changes, or have it checked
                for anything that looks unintentional.
              </Text>
              <div className="ReleasePage__cardButtons flex flex-wrap gap-2">
                <Button
                  size="xs"
                  icon={<IconSparkles />}
                  onClick={props.onSummarize}
                >
                  Summarize
                </Button>
                <Button
                  size="xs"
                  icon={<IconListSearch />}
                  onClick={props.onAudit}
                >
                  Audit
                </Button>
              </div>
            </Surface>
          )}
          <Surface className="ReleasePage__card flex flex-col gap-2.5 p-4">
            <div className="ReleasePage__cardTitle flex items-center gap-1.5 text-base font-semibold text-fg">
              Details
            </div>
            <dl className="ReleasePage__details m-0 grid gap-x-4 gap-y-2 text-sm">
              <ReleasePage.DetailsRow
                label="Created"
                at={release.createdAt}
                by={release.createdBy}
              />
              {release.scheduledAt && (
                <ReleasePage.DetailsRow
                  label="Scheduled"
                  at={release.scheduledAt}
                  by={release.scheduledBy}
                />
              )}
              {release.publishedAt && (
                <ReleasePage.DetailsRow
                  label="Published"
                  at={release.publishedAt}
                  by={release.publishedBy}
                />
              )}
              {release.rolledBackAt && (
                <ReleasePage.DetailsRow
                  label="Rolled back"
                  at={release.rolledBackAt}
                  by={release.rolledBackBy}
                />
              )}
              {release.archivedAt && (
                <ReleasePage.DetailsRow
                  label="Archived"
                  at={release.archivedAt}
                  by={release.archivedBy}
                />
              )}
            </dl>
          </Surface>
        </div>
      )}
    </div>
  );
};

ReleasePage.DetailsRow = (props: {
  label: string;
  at?: unknown;
  by?: string;
}) => {
  const hasDate = testTimestamp(props.at);
  return (
    <>
      <dt className="ReleasePage__detailsLabel text-muted">{props.label}</dt>
      <dd className="ReleasePage__detailsValue m-0 text-right text-fg wrap-anywhere">
        {hasDate ? formatDetailsDate(props.at) : '—'}
        {hasDate && props.by && ` by ${props.by}`}
      </dd>
    </>
  );
};

/** Classes for a row of the contents table; see `CELL_CLASSES`. */
const ROW_CLASSES =
  'ReleasePage__row group/row max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:border-0 max-md:border-b max-md:border-solid max-md:border-surface-active max-md:p-4 max-md:last:border-b-0';

/**
 * Classes for a cell of the contents table: a table cell from `md` up, and a
 * plain block in the stacked rows below it.
 */
const CELL_CLASSES =
  'ReleasePage__cell block p-0 md:table-cell md:border-0 md:border-b md:border-solid md:border-surface-active md:px-4 md:py-2.5 md:align-middle md:group-last/row:border-b-0';

/** The icon, title and subtitle of an item in the contents table. */
function ContentsItemLink(props: {
  href: string;
  icon: ComponentChildren;
  iconClassName: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <a
      className="ReleasePage__item group flex items-center gap-3 text-fg no-underline"
      href={props.href}
    >
      <div
        className={cn(
          'ReleasePage__itemIcon flex size-8 shrink-0 items-center justify-center rounded-md',
          props.iconClassName
        )}
      >
        {props.icon}
      </div>
      <div className="ReleasePage__itemText min-w-0">
        <div className="ReleasePage__itemTitle font-semibold wrap-anywhere underline-offset-3 group-hover:underline">
          {props.title}
        </div>
        {props.subtitle && (
          <div className="ReleasePage__itemSubtitle mt-0.5 text-sm text-muted wrap-anywhere">
            {props.subtitle}
          </div>
        )}
      </div>
    </a>
  );
}

ReleasePage.ContentsDocRow = (props: {
  docId: string;
  docDiff?: ReleaseDocDiff;
  loading: boolean;
}) => {
  const docId = props.docId;
  // For a published release, `after` is the published doc, otherwise it's
  // the draft.
  const doc = props.docDiff?.after || props.docDiff?.before || null;
  const title = doc ? getDocTitle(docId, doc) : '';
  const sys: any = doc?.sys;
  return (
    <tr className={ROW_CLASSES}>
      <td className={cn(CELL_CLASSES, 'max-md:w-full')}>
        <ContentsItemLink
          href={`/cms/content/${docId}`}
          icon={<IconFile size={16} stroke={1.5} />}
          iconClassName="ReleasePage__itemIcon--doc bg-info-soft text-info"
          title={title || docId}
          subtitle={title ? docId : undefined}
        />
      </td>
      <td className={CELL_CLASSES}>
        {doc ? (
          <DocStatusBadges doc={doc} docId={docId} hideReleases />
        ) : props.loading ? (
          <Spinner size="sm" className="text-muted" />
        ) : (
          <Text size="body-sm" color="gray">
            Not found
          </Text>
        )}
      </td>
      <td className={cn(CELL_CLASSES, 'max-md:min-w-0 max-md:flex-1')}>
        <div className="ReleasePage__modified text-sm">
          <ReleasePage.ModifiedBy at={sys?.modifiedAt} by={sys?.modifiedBy} />
        </div>
      </td>
    </tr>
  );
};

ReleasePage.ContentsDataSourceRow = (props: {
  id: string;
  dataSource?: DataSource;
}) => {
  const ds = props.dataSource;
  return (
    <tr className={ROW_CLASSES}>
      <td className={cn(CELL_CLASSES, 'max-md:w-full')}>
        <ContentsItemLink
          href={`/cms/data/${props.id}`}
          icon={<IconDatabase size={16} stroke={1.5} />}
          iconClassName="ReleasePage__itemIcon--dataSource bg-success-soft text-success"
          title={props.id}
          subtitle={ds?.description || 'Data source'}
        />
      </td>
      <td className={CELL_CLASSES}>
        {ds && <ReleasePage.DataSourceStatusBadges dataSource={ds} />}
      </td>
      <td className={cn(CELL_CLASSES, 'max-md:min-w-0 max-md:flex-1')}>
        <div className="ReleasePage__modified text-sm">
          <ReleasePage.ModifiedBy at={ds?.syncedAt} by={ds?.syncedBy} />
        </div>
      </td>
    </tr>
  );
};

/**
 * Renders e.g. "2 days ago by jane@example.com", with the date and time in a
 * tooltip.
 */
ReleasePage.ModifiedBy = (props: {at?: unknown; by?: string}) => {
  const hasDate = testTimestamp(props.at);
  if (!hasDate && !props.by) {
    return null;
  }
  return (
    <>
      {hasDate && (
        <Tooltip label={formatDate(props.at)}>
          <span className="ReleasePage__modifiedDate cursor-default underline decoration-dotted underline-offset-3">
            {formatTimeAgo(props.at)}
          </span>
        </Tooltip>
      )}
      {hasDate && props.by && ' by '}
      {props.by}
    </>
  );
};

/**
 * Renders a data source's status using the same badges as docs: "Draft" when
 * the synced data hasn't been published, and "Published" once it has.
 */
ReleasePage.DataSourceStatusBadges = (props: {dataSource: DataSource}) => {
  const ds = props.dataSource;
  const synced = testTimestamp(ds.syncedAt);
  const published = testTimestamp(ds.publishedAt);
  const hasUnpublishedSync =
    synced && (!published || toMillis(ds.syncedAt) > toMillis(ds.publishedAt));
  return (
    <div className="DocStatusBadges">
      {(hasUnpublishedSync || !synced) && (
        <UserActionTooltip
          heading={published ? 'Unpublished changes' : undefined}
          message={
            synced ? `Synced ${formatTimeAgo(ds.syncedAt)}` : 'Not synced yet'
          }
          user={synced ? ds.syncedBy : undefined}
        >
          <StatusBadge tone="draft">Draft</StatusBadge>
        </UserActionTooltip>
      )}
      {published && (
        <UserActionTooltip
          message={`Published ${formatTimeAgo(ds.publishedAt)}`}
          user={ds.publishedBy}
        >
          <StatusBadge tone="published">Published</StatusBadge>
        </UserActionTooltip>
      )}
      {testTimestamp(ds.archivedAt) && (
        <UserActionTooltip
          message={`Archived ${formatTimeAgo(ds.archivedAt)}`}
          user={ds.archivedBy}
        >
          <StatusBadge tone="archived">Archived</StatusBadge>
        </UserActionTooltip>
      )}
    </div>
  );
};

/** The changes tab: the diff of each doc in the release. */
ReleasePage.Changes = (props: {
  release: Release;
  diff: ReleaseDiff | null;
  diffLoading: boolean;
}) => {
  const diff = props.diff;
  const docs = diff?.docs || [];
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const selected =
    docs.find((doc) => doc.docId === selectedDocId) ||
    docs.find((doc) => doc.status !== 'unchanged') ||
    docs[0];

  if (props.diffLoading) {
    return <Spinner className="text-muted" />;
  }
  if (!diff || docs.length === 0) {
    return (
      <Text size="body-sm" color="gray">
        There are no docs in this release.
      </Text>
    );
  }

  const labels = getReleaseDiffLabels(diff.mode);
  const numChanged = docs.filter((doc) => doc.status !== 'unchanged').length;

  return (
    <div className="ReleasePage__changes flex flex-col gap-4">
      <div className="ReleasePage__changesToolbar">
        <Text size="body-sm" color="gray">
          {numChanged} of {docs.length} {docs.length === 1 ? 'doc' : 'docs'}{' '}
          changed, comparing <b>{labels.before}</b> to <b>{labels.after}</b>.
          {diff.mode === 'released' &&
            ' These are the changes made when the release was published.'}
        </Text>
      </div>

      <Surface className="ReleasePage__changesPanes flex min-h-100 flex-col md:flex-row">
        <div
          className="ReleasePage__changesList max-h-60 shrink-0 overflow-y-auto border-0 border-b border-solid border-border py-2 md:max-h-none md:w-70 md:border-b-0 md:border-r"
          role="listbox"
          aria-label="Docs"
        >
          {docs.map((doc) => (
            <button
              key={doc.docId}
              type="button"
              role="option"
              aria-selected={doc === selected}
              className="ReleasePage__changesItem m-0 flex w-full cursor-pointer appearance-none flex-col gap-1 border-0 bg-transparent px-4 py-2.5 text-left font-sans text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus aria-selected:bg-surface-active"
              onClick={() => setSelectedDocId(doc.docId)}
            >
              <div className="ReleasePage__changesDocId text-sm font-semibold wrap-anywhere">
                {doc.docId}
              </div>
              <div className="ReleasePage__changesMeta flex items-center gap-2 text-sm text-muted">
                <span
                  className={cn(
                    'ReleasePage__status',
                    `ReleasePage__status--${doc.status}`,
                    'rounded-sm px-1.5 py-px text-xs font-semibold',
                    STATUS_CLASSES[doc.status]
                  )}
                >
                  {DOC_DIFF_STATUS_LABELS[doc.status]}
                </span>
                {doc.status === 'modified' && doc.changes.length > 0 && (
                  <span>
                    {doc.changes.length === 1
                      ? '1 change'
                      : `${doc.changes.length} changes`}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="ReleasePage__changesDiff min-w-0 flex-1 p-4 md:px-6 md:py-5">
          {selected && (
            <>
              <div className="ReleasePage__changesDiffHeader mb-4 flex items-center gap-3">
                <Heading size="h3" className="min-w-0 wrap-anywhere">
                  {selected.docId}
                </Heading>
                <Button
                  className="ReleasePage__openDoc ml-auto"
                  size="xs"
                  href={`/cms/content/${selected.docId}`}
                >
                  Open doc
                </Button>
              </div>
              <DocDiffViewer
                key={selected.docId}
                left={{docId: selected.docId, versionId: labels.before}}
                right={{docId: selected.docId, versionId: labels.after}}
                docs={{left: selected.before, right: selected.after}}
                showAiSummary={false}
              />
            </>
          )}
        </div>
      </Surface>
    </div>
  );
};

/** Colors of the status pill in the changes list. */
const STATUS_CLASSES: Record<ReleaseDocDiffStatus, string> = {
  added: 'bg-success-soft text-success',
  removed: 'bg-danger-soft text-danger',
  modified: 'bg-warning-soft text-warning',
  unchanged: 'bg-chip text-muted',
  missing: 'bg-danger-soft text-danger',
};

/** Fetches the data sources with the given ids, keyed by id. */
function useDataSources(ids: string[]): Record<string, DataSource> {
  const [dataSources, setDataSources] = useState<Record<string, DataSource>>(
    {}
  );
  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const ds = await getDataSource(id);
          return [id, ds] as const;
        })
      );
      if (cancelled) {
        return;
      }
      const map: Record<string, DataSource> = {};
      for (const [id, ds] of entries) {
        if (ds) {
          map[id] = ds;
        }
      }
      setDataSources(map);
    }
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [ids.join(',')]);
  return dataSources;
}

/** Returns a doc's title, using the collection's preview config. */
function getDocTitle(docId: string, doc: CMSDoc): string {
  const collectionId = docId.split('/')[0];
  const collection = window.__ROOT_CTX.collections[collectionId];
  const title = getNestedValue(
    doc.fields || {},
    collection?.preview?.title || 'meta.title'
  );
  return typeof title === 'string' ? title : '';
}

/**
 * Formats a Firestore timestamp as e.g. "2 days ago". Accepts serialized
 * timestamps (e.g. `{seconds, nanoseconds}`), which don't have `toMillis()`.
 */
function formatTimeAgo(ts: unknown): string {
  return getTimeAgo(toMillis(ts));
}

/**
 * Formats a Firestore timestamp as e.g. "2026-10-24 01:30 PM" in local time.
 */
function formatDate(ts: unknown): string {
  const date = new Date(toMillis(ts));
  const pad = (n: number) => String(n).padStart(2, '0');
  const hours = date.getHours();
  const ampm = hours < 12 ? 'AM' : 'PM';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(hours % 12 || 12)}:${pad(date.getMinutes())} ${ampm}`
  );
}

/** Formats a Firestore timestamp as e.g. "Oct 26, 2026, 1:30 PM". */
function formatDetailsDate(ts: unknown): string {
  return new Date(toMillis(ts)).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function rollbackConflictLabel(conflict: ReleaseRollbackConflict) {
  return conflict.locale ? `${conflict.id} (${conflict.locale})` : conflict.id;
}

function rollbackConflictDetails(conflict: ReleaseRollbackConflict) {
  const verb = conflict.reason === 'published' ? 'published' : 'unpublished';
  const parts = [verb];
  if (testTimestamp(conflict.publishedAt)) {
    parts.push(formatTimeAgo(conflict.publishedAt));
  }
  if (conflict.publishedBy) {
    parts.push(`by ${conflict.publishedBy}`);
  }
  return parts.join(' ');
}
