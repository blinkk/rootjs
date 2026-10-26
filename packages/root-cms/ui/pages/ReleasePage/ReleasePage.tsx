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
  IconChevronRight,
  IconListSearch,
  IconRobot,
  IconSettings,
  IconSparkles,
} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useCallback, useEffect, useMemo, useState} from 'preact/hooks';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {DataSourceIcon} from '../../components/DataSourceIcon/DataSourceIcon.js';
import {DocDiffViewer} from '../../components/DocDiffViewer/DocDiffViewer.js';
import {DocPreviewCard} from '../../components/DocPreviewCard/DocPreviewCard.js';
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
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {
  usePublishChecks,
  type PublishChecksDecision,
} from '../../hooks/usePublishChecks.js';
import {Layout} from '../../layout/Layout.js';
import {testAiEnabled} from '../../utils/ai.js';
import {joinClassNames} from '../../utils/classes.js';
import {DataSource, getDataSource} from '../../utils/data-source.js';
import {errorMessage, notifyErrors} from '../../utils/notifications.js';
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
import {getTimeAgo, timestamp} from '../../utils/time.js';
import {withTimeout} from '../../utils/with-timeout.js';

const SUMMARIZE_PROMPT =
  'Summarize the changes in this release. Group related changes together ' +
  'and keep it brief.';

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
  const [updated, setUpdated] = useState(0);
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
    await notifyErrors(async () => {
      const release = await withTimeout(
        getRelease(id),
        undefined,
        'loading the release'
      );
      setRelease(release);
      setUpdated(timestamp());
    });
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  function onAction(action: string) {
    console.log('onAction()', action);
    init();
  }

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
              <Heading size="h1">Release: {id}</Heading>
              <div className="ReleasePage__header__controls">
                <Tooltip label="Configure">
                  <ActionIcon
                    component="a"
                    href={`/cms/releases/${props.id}/edit`}
                  >
                    <IconSettings size={24} stroke="1.5" />
                  </ActionIcon>
                </Tooltip>
              </div>
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
            </div>
            {release?.description && (
              <Markdown
                className="ReleasePage__header__description"
                code={release.description}
              />
            )}
          </div>

          {loading ? (
            <Loader color="gray" size="xl" />
          ) : (
            <>
              {release && (
                <ReleasePage.PublishStatus
                  release={release}
                  onAction={onAction}
                />
              )}
              {release && release.docIds && release.docIds.length > 0 && (
                <ReleasePage.Changes
                  release={release}
                  key={`changes-${updated}`}
                  onAskAi={aiEnabled ? askAi : undefined}
                />
              )}
              {release && release.docIds && release.docIds.length > 0 && (
                <ReleasePage.DocsList
                  release={release}
                  key={`docs-list-${updated}`}
                />
              )}
              {release &&
                release.dataSourceIds &&
                release.dataSourceIds.length > 0 && (
                  <ReleasePage.DataSourcesList
                    release={release}
                    key={`data-sources-${updated}`}
                  />
                )}
            </>
          )}
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

ReleasePage.PublishStatus = (props: {
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
    <div className="ReleasePage__PublishStatus">
      <Heading size="h2">Status</Heading>
      <Surface>
        <Table
          className="ReleasePage__PublishStatus__table"
          verticalSpacing="xs"
          striped
          fontSize="xs"
        >
          <thead>
            <tr>
              <th>status</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <ReleaseStatusBadge release={release} />
              </td>
              <td>
                <div className="ReleasePage__PublishStatus__actions">
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
                          variant="default"
                          size="xs"
                          compact
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
                            compact
                            onClick={() => onCancelScheduleClicked()}
                            disabled={!canPublish}
                          >
                            Cancel Schedule
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
                            compact
                            onClick={() => onScheduleClicked()}
                            disabled={!canPublish}
                          >
                            Schedule
                          </Button>
                        </Tooltip>
                      </ConditionalTooltip>
                    ))}
                  {!release.archivedAt &&
                    !release.scheduledAt &&
                    release.publishedAt && (
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
                            compact
                            onClick={() => onRollbackClicked()}
                            loading={rollbackLoading}
                            disabled={!canPublish || publishLoading}
                          >
                            Rollback
                          </Button>
                        </Tooltip>
                      </ConditionalTooltip>
                    )}
                </div>
                {!release.archivedAt &&
                  releaseHasChecks &&
                  publishChecks.isAdmin && (
                    <Checkbox
                      className="ReleasePage__PublishStatus__skipChecks"
                      label="Skip publishing checks (admins only)"
                      size="xs"
                      checked={skipChecks}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setSkipChecks(e.currentTarget.checked);
                      }}
                    />
                  )}
              </td>
            </tr>
          </tbody>
        </Table>
      </Surface>
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
 * Shows the content changes made by the docs in the release, with buttons to
 * have Root AI summarize or audit them.
 */
ReleasePage.Changes = (props: {
  release: Release;
  onAskAi?: (prompt: string) => void;
}) => {
  const release = props.release;
  const [loading, setLoading] = useState(true);
  const [diff, setDiff] = useState<ReleaseDiff | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      await notifyErrors(async () => {
        const diff = await withTimeout(
          getReleaseDiff(release),
          undefined,
          'loading the release changes'
        );
        if (!cancelled) {
          setDiff(diff);
        }
      });
      if (!cancelled) {
        setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [release.id]);

  const labels = getReleaseDiffLabels(diff?.mode || 'pending');
  const numChanged = (diff?.docs || []).filter(
    (doc) => doc.status !== 'unchanged'
  ).length;

  return (
    <div className="ReleasePage__Changes">
      <div className="ReleasePage__Changes__header">
        <Heading size="h2">Changes</Heading>
        {props.onAskAi && (
          <div className="ReleasePage__Changes__header__ai">
            <Tooltip
              label="Have Root AI summarize the changes in the release"
              position="bottom"
              withArrow
              wrapLines
              width={200}
            >
              <Button
                variant="default"
                size="xs"
                compact
                leftIcon={<IconSparkles size={14} />}
                onClick={() => props.onAskAi!(SUMMARIZE_PROMPT)}
              >
                Summarize
              </Button>
            </Tooltip>
            <Tooltip
              label="Have Root AI review the changes for anything unintentional"
              position="bottom"
              withArrow
              wrapLines
              width={200}
            >
              <Button
                variant="default"
                size="xs"
                compact
                leftIcon={<IconListSearch size={14} />}
                onClick={() => props.onAskAi!(AUDIT_PROMPT)}
              >
                Audit
              </Button>
            </Tooltip>
          </div>
        )}
      </div>
      {loading ? (
        <Loader color="gray" size="sm" />
      ) : diff ? (
        <>
          <Text
            className="ReleasePage__Changes__summary"
            size="body-sm"
            color="gray"
          >
            {numChanged} of {diff.docs.length}{' '}
            {diff.docs.length === 1 ? 'doc' : 'docs'} changed, comparing{' '}
            {labels.before} to {labels.after}.
            {diff.mode === 'released' &&
              ' These are the changes made when the release was published.'}
          </Text>
          <Surface className="ReleasePage__Changes__docs">
            {diff.docs.map((doc) => (
              <ReleasePage.DocChanges
                key={doc.docId}
                doc={doc}
                mode={diff.mode}
              />
            ))}
          </Surface>
        </>
      ) : null}
    </div>
  );
};

ReleasePage.DocChanges = (props: {
  doc: ReleaseDocDiff;
  mode: ReleaseDiff['mode'];
}) => {
  const doc = props.doc;
  const [expanded, setExpanded] = useState(false);
  const labels = getReleaseDiffLabels(props.mode);
  const canExpand = doc.status !== 'unchanged' && doc.status !== 'missing';
  const modifiedBy = (doc.after?.sys || doc.before?.sys)?.modifiedBy;
  const numChanges = doc.changes.length;

  return (
    <div
      className={joinClassNames(
        'ReleasePage__DocChanges',
        expanded && 'ReleasePage__DocChanges--expanded'
      )}
    >
      <button
        type="button"
        className="ReleasePage__DocChanges__row"
        onClick={() => setExpanded((expanded) => !expanded)}
        disabled={!canExpand}
      >
        <IconChevronRight
          className="ReleasePage__DocChanges__row__chevron"
          size={14}
        />
        <span className="ReleasePage__DocChanges__row__docId">{doc.docId}</span>
        <span
          className={joinClassNames(
            'ReleasePage__DocChanges__row__status',
            `ReleasePage__DocChanges__row__status--${doc.status}`
          )}
        >
          {DOC_DIFF_STATUS_LABELS[doc.status]}
        </span>
        {doc.status === 'modified' && numChanges > 0 && (
          <span className="ReleasePage__DocChanges__row__count">
            {numChanges === 1 ? '1 change' : `${numChanges} changes`}
          </span>
        )}
        {modifiedBy && (
          <span className="ReleasePage__DocChanges__row__modifiedBy">
            {modifiedBy}
          </span>
        )}
      </button>
      {expanded && (
        <div className="ReleasePage__DocChanges__diff">
          <DocDiffViewer
            left={{docId: doc.docId, versionId: labels.before}}
            right={{docId: doc.docId, versionId: labels.after}}
            docs={{left: doc.before, right: doc.after}}
            showAiSummary={false}
          />
        </div>
      )}
    </div>
  );
};

ReleasePage.DocsList = (props: {release: Release}) => {
  const release = props.release;
  const docIds = release.docIds || [];
  return (
    <div className="ReleasePage__DocsList">
      <div className="ReleasePage__DocsList__header">
        <Heading size="h2">Docs</Heading>
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
      <Surface className="ReleasePage__DocsList__cards">
        {docIds.map((docId) => (
          <div key={docId} className="ReleasePage__DocsList__card">
            <a href={`/cms/content/${docId}`}>
              <DocPreviewCard docId={docId} statusBadges hideReleases />
            </a>
          </div>
        ))}
      </Surface>
    </div>
  );
};

ReleasePage.DataSourcesList = (props: {release: Release}) => {
  const release = props.release;
  const ids = release.dataSourceIds || [];
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

  return (
    <div className="ReleasePage__DataSourcesList">
      <div className="ReleasePage__DataSourcesList__header">
        <Heading size="h2">Data Sources</Heading>
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
      <Surface className="ReleasePage__DataSourcesList__items">
        {ids.map((id) => {
          const ds = dataSources[id];
          return (
            <a
              key={id}
              className="ReleasePage__DataSourcesList__item"
              href={`/cms/data/${id}`}
            >
              <DataSourceIcon
                className="ReleasePage__DataSourcesList__item__icon"
                type={ds?.type}
              />
              <div className="ReleasePage__DataSourcesList__item__info">
                <div className="ReleasePage__DataSourcesList__item__id">
                  {id}
                </div>
                {ds?.description && (
                  <div className="ReleasePage__DataSourcesList__item__description">
                    {ds.description}
                  </div>
                )}
              </div>
            </a>
          );
        })}
      </Surface>
    </div>
  );
};

function rollbackConflictLabel(conflict: ReleaseRollbackConflict) {
  return conflict.locale ? `${conflict.id} (${conflict.locale})` : conflict.id;
}

function rollbackConflictDetails(conflict: ReleaseRollbackConflict) {
  const verb = conflict.reason === 'published' ? 'published' : 'unpublished';
  const parts = [verb];
  if (conflict.publishedAt?.toMillis) {
    parts.push(getTimeAgo(conflict.publishedAt.toMillis()));
  }
  if (conflict.publishedBy) {
    parts.push(`by ${conflict.publishedBy}`);
  }
  return parts.join(' ');
}
