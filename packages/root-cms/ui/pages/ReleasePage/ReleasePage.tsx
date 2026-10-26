import './ReleasePage.css';

import {
  ActionIcon,
  Breadcrumbs,
  Button,
  Checkbox,
  Loader,
  Table,
  Tooltip,
} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {
  IconDatabase,
  IconFile,
  IconListSearch,
  IconRobot,
  IconSettings,
  IconSparkles,
} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useCallback, useEffect, useMemo, useState} from 'preact/hooks';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {DocDiffViewer} from '../../components/DocDiffViewer/DocDiffViewer.js';
import {
  DocStatusBadges,
  StatusBadge,
} from '../../components/DocStatusBadges/DocStatusBadges.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Markdown} from '../../components/Markdown/Markdown.js';
import {ReleaseStatusBadge} from '../../components/ReleaseStatusBadge/ReleaseStatusBadge.js';
import {
  RootAIChat,
  RootAIChatPrompt,
} from '../../components/RootAIChat/RootAIChat.js';
import {useScheduleReleaseModal} from '../../components/ScheduleReleaseModal/ScheduleReleaseModal.js';
import {Surface} from '../../components/Surface/Surface.js';
import {Text} from '../../components/Text/Text.js';
import {UserActionTooltip} from '../../components/UserActionTooltip/UserActionTooltip.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {
  usePublishChecks,
  type PublishChecksDecision,
} from '../../hooks/usePublishChecks.js';
import {useStringParam} from '../../hooks/useQueryParam.js';
import {Layout} from '../../layout/Layout.js';
import {testAiEnabled} from '../../utils/ai.js';
import {joinClassNames} from '../../utils/classes.js';
import {DataSource, getDataSource} from '../../utils/data-source.js';
import {testTimestamp, toMillis} from '../../utils/doc-changes.js';
import {CMSDoc} from '../../utils/doc.js';
import {errorMessage, notifyErrors} from '../../utils/notifications.js';
import {getNestedValue} from '../../utils/objects.js';
import {testCanPublish} from '../../utils/permissions.js';
import {testHasPublishChecks} from '../../utils/publish-checks.js';
import {
  ReleaseDiff,
  ReleaseDocDiff,
  ReleaseDocDiffStatus,
  getReleaseDiff,
  getReleaseDiffLabels,
} from '../../utils/release-diff.js';
import {
  ReleaseRollbackConflict,
  getReleaseRollbackPlan,
} from '../../utils/release-rollback.js';
import {
  Release,
  cancelScheduledRelease,
  getRelease,
  publishRelease,
  rollbackRelease,
} from '../../utils/release.js';
import {getTimeAgo} from '../../utils/time.js';
import {withTimeout} from '../../utils/with-timeout.js';

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
      <div className="ReleasePage__layout">
        <div className="ReleasePage">
          <div className="ReleasePage__header">
            <Breadcrumbs className="ReleasePage__header__breadcrumbs">
              <a href="/cms/releases">Releases</a>
              <div>{id}</div>
            </Breadcrumbs>
            <div className="ReleasePage__header__titleWrap">
              <Heading size="h1">{id}</Heading>
              {release && <ReleaseStatusBadge release={release} />}
              <div className="ReleasePage__header__actions">
                {aiEnabled && (
                  <Button
                    className={joinClassNames(
                      'ReleasePage__header__ai',
                      aiVisible && 'ReleasePage__header__ai--active'
                    )}
                    variant="default"
                    color="dark"
                    size="xs"
                    leftIcon={<IconRobot size={16} />}
                    onClick={() =>
                      aiVisible ? closeAi() : setAiVisible(() => true)
                    }
                  >
                    Root AI
                  </Button>
                )}
                <Tooltip label="Configure">
                  <ActionIcon
                    className="ReleasePage__header__configure"
                    component="a"
                    variant="default"
                    size={30}
                    href={`/cms/releases/${props.id}/edit`}
                  >
                    <IconSettings size={16} stroke="1.5" />
                  </ActionIcon>
                </Tooltip>
                {release && (
                  <ReleasePage.Actions release={release} onAction={onAction} />
                )}
              </div>
            </div>
            {release?.description && (
              <Markdown
                className="ReleasePage__header__description"
                code={release.description}
              />
            )}
            {release && (
              <Text
                className="ReleasePage__header__meta"
                size="body-sm"
                color="gray"
              >
                {getReleaseMeta(release)}
              </Text>
            )}
            <div className="ReleasePage__tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'overview'}
                className={joinClassNames(
                  'ReleasePage__tabs__tab',
                  tab === 'overview' && 'ReleasePage__tabs__tab--active'
                )}
                onClick={() => setTabParam('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'changes'}
                className={joinClassNames(
                  'ReleasePage__tabs__tab',
                  tab === 'changes' && 'ReleasePage__tabs__tab--active'
                )}
                onClick={() => setTabParam('changes')}
              >
                Changes
                {diff && (
                  <span className="ReleasePage__tabs__tab__count">
                    {numChanged}
                  </span>
                )}
              </button>
            </div>
          </div>

          {loading ? (
            <Loader color="gray" size="xl" />
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
    <div className="ReleasePage__ai">
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
  const modalTheme = useModalTheme();
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
      ...modalTheme,
      title: `Publish release: ${release.id}`,
      children: (
        <>
          <Text size="body-sm" weight="semi-bold">
            Are you sure you want to publish this release? The {total} items in
            the release will go live immediately.
          </Text>
          {(decision.skipped || decision.bypassed) && (
            <Text size="body-sm" color="red">
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
      ...modalTheme,
      title: `Rollback release: ${release.id}`,
      children: (
        <>
          <Text size="body-sm" weight="semi-bold">
            Are you sure you want to rollback this release? The {numItems} items
            in the release will be restored to their published state from before
            the release was published. Drafts are not changed.
          </Text>
          {conflicts.length > 0 && (
            <div className="ReleasePage__rollbackConflicts">
              <Text size="body-sm" weight="semi-bold">
                Warning: the following items have been published or unpublished
                since the release was published. Rolling back will overwrite
                those changes.
              </Text>
              <ul>
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
    <div className="ReleasePage__actions">
      <div className="ReleasePage__actions__buttons">
        {!release.archivedAt && !release.scheduledAt && release.publishedAt && (
          <ConditionalTooltip
            label="You don't have access to rollback this release"
            condition={!canPublish}
          >
            <Tooltip
              label="Restore the items in the release to their state before the release was published"
              position="bottom"
              withArrow
              wrapLines
              width={220}
              disabled={!canPublish}
            >
              <Button
                variant="default"
                size="xs"
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
                position="bottom"
                withArrow
                disabled={!canPublish}
              >
                <Button
                  variant="default"
                  size="xs"
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
                position="bottom"
                withArrow
                wrapLines
                width={180}
                disabled={!canPublish}
              >
                <Button
                  variant="default"
                  size="xs"
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
              position="bottom"
              withArrow
              disabled={!canPublish}
            >
              <Button
                color="dark"
                size="xs"
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
          className="ReleasePage__actions__skipChecks"
          label="Skip publishing checks (admins only)"
          size="xs"
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
  const docDiffs: Record<string, ReleaseDocDiff> = {};
  for (const doc of props.diff?.docs || []) {
    docDiffs[doc.docId] = doc;
  }

  return (
    <div className="ReleasePage__Overview">
      <div className="ReleasePage__Overview__main">
        <div className="ReleasePage__sectionHeader">
          <Heading size="h2">Contents</Heading>
          <Button
            component="a"
            variant="default"
            size="xs"
            compact
            href={`/cms/releases/${release.id}/edit`}
          >
            Edit
          </Button>
        </div>
        {docIds.length === 0 && dataSourceIds.length === 0 ? (
          <Text size="body-sm" color="gray">
            Nothing has been added to this release yet.
          </Text>
        ) : (
          <Surface className="ReleasePage__Contents">
            <Table verticalSpacing="sm" fontSize="sm">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Status</th>
                  <th>Last modified</th>
                </tr>
              </thead>
              <tbody>
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
            </Table>
          </Surface>
        )}
      </div>
      <div className="ReleasePage__Overview__side">
        {props.onSummarize && props.onAudit && (
          <Surface className="ReleasePage__card">
            <div className="ReleasePage__card__title">
              <IconRobot size={16} />
              Root AI
            </div>
            <Text size="body-sm" color="gray">
              Get a summary of what this release changes, or have it checked for
              anything that looks unintentional.
            </Text>
            <div className="ReleasePage__card__buttons">
              <Button
                variant="default"
                size="xs"
                compact
                leftIcon={<IconSparkles size={14} />}
                onClick={props.onSummarize}
              >
                Summarize
              </Button>
              <Button
                variant="default"
                size="xs"
                compact
                leftIcon={<IconListSearch size={14} />}
                onClick={props.onAudit}
              >
                Audit
              </Button>
            </div>
          </Surface>
        )}
        <Surface className="ReleasePage__card">
          <div className="ReleasePage__card__title">Details</div>
          <dl className="ReleasePage__details">
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
      <dt>{props.label}</dt>
      <dd>
        {hasDate ? (
          <Tooltip label={formatDate(props.at)} transition="pop" withArrow>
            <span className="ReleasePage__details__date">
              {formatShortDate(props.at)}
            </span>
          </Tooltip>
        ) : (
          '—'
        )}
        {hasDate && props.by && ` by ${props.by}`}
      </dd>
    </>
  );
};

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
    <tr>
      <td>
        <a
          className="ReleasePage__Contents__item"
          href={`/cms/content/${docId}`}
        >
          <div className="ReleasePage__Contents__item__icon ReleasePage__Contents__item__icon--doc">
            <IconFile size={16} stroke={1.5} />
          </div>
          <div className="ReleasePage__Contents__item__text">
            <div className="ReleasePage__Contents__item__title">
              {title || docId}
            </div>
            {title && (
              <div className="ReleasePage__Contents__item__id">{docId}</div>
            )}
          </div>
        </a>
      </td>
      <td>
        {doc ? (
          <DocStatusBadges doc={doc} docId={docId} hideReleases />
        ) : props.loading ? (
          <Loader size="xs" color="gray" />
        ) : (
          <Text size="body-sm" color="gray">
            Not found
          </Text>
        )}
      </td>
      <td>
        <div className="ReleasePage__Contents__modified">
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
    <tr>
      <td>
        <a
          className="ReleasePage__Contents__item"
          href={`/cms/data/${props.id}`}
        >
          <div className="ReleasePage__Contents__item__icon ReleasePage__Contents__item__icon--dataSource">
            <IconDatabase size={16} stroke={1.5} />
          </div>
          <div className="ReleasePage__Contents__item__text">
            <div className="ReleasePage__Contents__item__title">{props.id}</div>
            <div className="ReleasePage__Contents__item__id">
              {ds?.description || 'Data source'}
            </div>
          </div>
        </a>
      </td>
      <td>{ds && <ReleasePage.DataSourceStatusBadges dataSource={ds} />}</td>
      <td>
        <div className="ReleasePage__Contents__modified">
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
        <Tooltip label={formatDate(props.at)} transition="pop" withArrow>
          <span className="ReleasePage__Contents__modified__date">
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
    return <Loader color="gray" size="md" />;
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
    <div className="ReleasePage__Changes">
      <div className="ReleasePage__Changes__toolbar">
        <Text size="body-sm" color="gray">
          {numChanged} of {docs.length} {docs.length === 1 ? 'doc' : 'docs'}{' '}
          changed, comparing <b>{labels.before}</b> to <b>{labels.after}</b>.
          {diff.mode === 'released' &&
            ' These are the changes made when the release was published.'}
        </Text>
      </div>

      <Surface className="ReleasePage__Changes__panes">
        <div className="ReleasePage__Changes__list" role="listbox">
          {docs.map((doc) => (
            <button
              key={doc.docId}
              type="button"
              role="option"
              aria-selected={doc === selected}
              className={joinClassNames(
                'ReleasePage__Changes__list__item',
                doc === selected && 'ReleasePage__Changes__list__item--active'
              )}
              onClick={() => setSelectedDocId(doc.docId)}
            >
              <div className="ReleasePage__Changes__list__item__docId">
                {doc.docId}
              </div>
              <div className="ReleasePage__Changes__list__item__meta">
                <span
                  className={joinClassNames(
                    'ReleasePage__status',
                    `ReleasePage__status--${doc.status}`
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
        <div className="ReleasePage__Changes__diff">
          {selected && (
            <>
              <div className="ReleasePage__Changes__diff__header">
                <Heading size="h3">{selected.docId}</Heading>
                <a href={`/cms/content/${selected.docId}`}>Open doc</a>
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

/** Formats a Firestore timestamp as e.g. "Oct 26, 2026". */
function formatShortDate(ts: unknown): string {
  return new Date(toMillis(ts)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
