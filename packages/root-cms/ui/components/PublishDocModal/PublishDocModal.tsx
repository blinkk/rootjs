import './PublishDocModal.css';

import {ActionIcon, Button, Checkbox, Loader, Tooltip} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleX,
  IconGitCompare,
  IconPackage,
  IconPlayerPlay,
  IconRobot,
  IconRocket,
} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useRef, useState} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {
  usePublishChecks,
  type PublishChecksDecision,
} from '../../hooks/usePublishChecks.js';
import {testAiEnabled} from '../../utils/ai.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDocFromCacheOrFetch} from '../../utils/doc-cache.js';
import {cmsPublishDoc, cmsScheduleDoc} from '../../utils/doc.js';
import {errorMessage} from '../../utils/notifications.js';
import {testCanPublish} from '../../utils/permissions.js';
import {
  getCollectionPublishChecks,
  runPublishChecks,
  type PublishCheckResult,
  type ResolvedPublishCheck,
} from '../../utils/publish-checks.js';
import {extractReferenceDocIds} from '../../utils/references.js';
import {getLocalISOString} from '../../utils/time.js';
import {testV2TranslationsEnabled} from '../../utils/translations-manager.js';
import {useAddToReleaseModal} from '../AddToReleaseModal/AddToReleaseModal.js';
import {AiSummaryResult, useAiSummary} from '../AiSummary/AiSummary.js';
import {DocDiffViewer} from '../DocDiffViewer/DocDiffViewer.js';
import {DocIdBadge} from '../DocIdBadge/DocIdBadge.js';
import {DocPreviewCard} from '../DocPreviewCard/DocPreviewCard.js';
import {Markdown} from '../Markdown/Markdown.js';
import {Text} from '../Text/Text.js';

const MODAL_ID = 'PublishDocModal';

export type PublishType = 'now' | 'scheduled';

export interface PublishDocModalProps {
  [key: string]: unknown;
  docId: string;
  /** Called after the doc is successfully published or scheduled. */
  onSuccess?: (event: {publishType: 'now' | 'scheduled'}) => void;
}

export function usePublishDocModal(props: PublishDocModalProps) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: () => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title: (
          <span className="PublishDocModal__title">
            <IconRocket size={18} stroke={1.75} />
            <span className="PublishDocModal__title__text">
              Publish {props.docId}
            </span>
          </span>
        ),
        innerProps: props,
        size: '640px',
      });
    },
  };
}

export function PublishDocModal(
  modalProps: ContextModalProps<PublishDocModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const [publishType, setPublishType] = useState<PublishType>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');
  const [messageFromAi, setMessageFromAi] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState(false);
  const [skipChecks, setSkipChecks] = useState(false);
  const [checksRunning, setChecksRunning] = useState(false);
  const [checkResults, setCheckResults] = useState<PublishCheckResult[] | null>(
    null
  );
  const dateTimeRef = useRef<HTMLInputElement>(null);
  const modals = useModals();
  const modalTheme = useModalTheme();
  const aiAvailable = testAiEnabled();
  const addToReleaseModal = useAddToReleaseModal({docIds: [props.docId]});

  const {roles, loading: rolesLoading} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);

  const publishChecks = usePublishChecks();
  const collectionId = props.docId.split('/')[0];
  const configuredChecks = getCollectionPublishChecks(collectionId);
  const hasChecks = configuredChecks.length > 0;

  const buttonLabel = publishType === 'scheduled' ? 'Schedule' : 'Publish';

  useEffect(() => {
    if (publishType === 'scheduled') {
      dateTimeRef.current?.focus();
    }
  }, [publishType]);

  async function publish(decision: PublishChecksDecision) {
    try {
      setLoading(true);
      await cmsPublishDoc(props.docId, {
        publishMessage: publishMessage.trim() || undefined,
        checksAudit: decision.audit || undefined,
      });
      showNotification({
        title: 'Published!',
        message: `Succesfully published ${props.docId}.`,
        autoClose: 10000,
      });
      props.onSuccess?.({publishType: 'now'});
      modals.closeAll();
      // Opened after `closeAll()` so the warnings aren't closed along with the
      // publish modal.
      publishChecks.showWarnings(decision.results, {actionLabel: 'Publish'});
    } catch (err) {
      console.error(err);
      const detail = errorMessage(err);
      showNotification({
        title: 'Publish failed',
        message: `Failed to publish ${props.docId}: ${detail}`,
        color: 'red',
        autoClose: false,
      });
    } finally {
      setLoading(false);
    }
  }

  async function schedule(decision: PublishChecksDecision) {
    try {
      setLoading(true);
      const millis = Math.floor(new Date(scheduledDate).getTime());
      await cmsScheduleDoc(props.docId, millis, {
        publishMessage: publishMessage.trim() || undefined,
        checksAudit: decision.audit || undefined,
      });
      showNotification({
        title: 'Scheduled!',
        message: `${props.docId} will go live ${scheduledDate}.`,
        autoClose: 10000,
      });
      props.onSuccess?.({publishType: 'scheduled'});
      modals.closeAll();
      // Opened after `closeAll()` so the warnings aren't closed along with the
      // publish modal.
      publishChecks.showWarnings(decision.results, {actionLabel: 'Schedule'});
    } catch (err) {
      console.error(err);
      const detail = errorMessage(err);
      showNotification({
        title: 'Schedule failed',
        message: `Failed to schedule ${props.docId}: ${detail}`,
        color: 'red',
        autoClose: false,
      });
    } finally {
      setLoading(false);
    }
  }

  async function generatePublishMessage() {
    try {
      setGeneratingMessage(true);
      const res = await window.fetch('/cms/api/ai.publish_message', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({docId: props.docId}),
      });
      const data = await res.json();
      if (data.success && data.message) {
        setPublishMessage(data.message);
        setMessageFromAi(true);
      } else {
        showNotification({
          title: 'Generation failed',
          message: 'Failed to generate publish message.',
          color: 'red',
          autoClose: 5000,
        });
      }
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Generation failed',
        message: 'Failed to generate publish message.',
        color: 'red',
        autoClose: 5000,
      });
    } finally {
      setGeneratingMessage(false);
    }
  }

  /** Runs the publishing checks to preview the results before publishing. */
  async function previewChecks() {
    try {
      setChecksRunning(true);
      setCheckResults(await runPublishChecks([props.docId]));
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Checks failed',
        message: `Failed to run publishing checks: ${errorMessage(err)}`,
        color: 'red',
        autoClose: false,
      });
    } finally {
      setChecksRunning(false);
    }
  }

  /**
   * Runs the collection's publishing checks and, if publishing isn't halted,
   * asks the user to confirm.
   */
  async function onSubmit() {
    let decision: PublishChecksDecision;
    try {
      setChecksRunning(true);
      decision = await publishChecks.run({
        docIds: [props.docId],
        actionLabel: buttonLabel,
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
    if (!decision.skipped && decision.results.length > 0) {
      setCheckResults(decision.results);
    }
    // Publishing was halted by a failed required check.
    if (!decision.proceed) {
      return;
    }
    openConfirmModal(decision);
  }

  function openConfirmModal(decision: PublishChecksDecision) {
    modals.openConfirmModal({
      ...modalTheme,
      title: `${buttonLabel} ${props.docId}`,
      children: (
        <>
          <Text
            size="body-sm"
            weight="semi-bold"
            className="PublishDocModal__confirmText"
          >
            Are you sure you want to publish the following doc? The doc will go
            live {publishType === 'now' ? 'now' : `at ${scheduledDate}`}.
          </Text>
          <DocIdBadge docId={props.docId} />
          {(decision.skipped || decision.bypassed) && (
            <Text
              size="body-sm"
              color="red"
              className="PublishDocModal__confirmText"
            >
              {decision.skipped
                ? 'Publishing checks will be skipped.'
                : 'Failed required checks will be bypassed.'}
            </Text>
          )}
        </>
      ),
      labels: {confirm: buttonLabel, cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'dark', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: true,
      onConfirm: () => {
        if (publishType === 'now') {
          publish(decision);
        } else if (publishType === 'scheduled') {
          schedule(decision);
        }
      },
    });
  }

  let disabled = false;
  if (publishType === 'scheduled' && !scheduledDate) {
    disabled = true;
  }
  if (rolesLoading || !canPublish) {
    disabled = true;
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="PublishDocModal">
      <form
        className="PublishDocModal__form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div
          className="PublishDocModal__types"
          role="radiogroup"
          aria-label="Publish type"
        >
          <PublishTypeButton
            selected={publishType === 'now'}
            onClick={() => setPublishType('now')}
          >
            <IconRocket size={15} stroke={1.75} />
            Publish now
          </PublishTypeButton>
          <PublishTypeButton
            selected={publishType === 'scheduled'}
            onClick={() => setPublishType('scheduled')}
          >
            <IconCalendarEvent size={15} stroke={1.75} />
            Schedule
          </PublishTypeButton>
          <button
            type="button"
            className="PublishDocModal__type"
            onClick={() => addToReleaseModal.open()}
          >
            <IconPackage size={15} stroke={1.75} />
            Add to release
          </button>
        </div>

        {publishType === 'scheduled' && (
          <PublishField label="Publish at" help={`Timezone: ${timezone}.`}>
            <input
              ref={dateTimeRef}
              className="PublishDocModal__input"
              type="datetime-local"
              value={scheduledDate}
              min={getLocalISOString()}
              aria-label="Publish at"
              onChange={(e: Event) => {
                const target = e.target as HTMLInputElement;
                setScheduledDate(target.value);
              }}
            />
          </PublishField>
        )}

        <PublishField
          label="Publish message"
          help={
            messageFromAi
              ? 'Suggested by Root AI. Review it before publishing.'
              : 'Optional. Describes the changes in the doc’s publish history.'
          }
        >
          <div className="PublishDocModal__message">
            <textarea
              className={joinClassNames(
                'PublishDocModal__input',
                'PublishDocModal__input--textarea',
                aiAvailable && 'PublishDocModal__input--withAction'
              )}
              placeholder="What changed?"
              aria-label="Publish message"
              value={publishMessage}
              rows={2}
              onInput={(e: Event) => {
                const target = e.target as HTMLTextAreaElement;
                setPublishMessage(target.value);
                setMessageFromAi(false);
              }}
            />
            {aiAvailable && (
              <Tooltip
                className="PublishDocModal__message__action"
                label="Suggest a publish message with Root AI"
                position="left"
                withArrow
              >
                <ActionIcon
                  variant="default"
                  size="sm"
                  aria-label="Suggest a publish message with Root AI"
                  loading={generatingMessage}
                  onClick={() => generatePublishMessage()}
                >
                  <IconRobot size={15} stroke={1.75} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>
        </PublishField>

        <PublishField label="Changes">
          <ChangesPanel docId={props.docId} aiAvailable={aiAvailable} />
        </PublishField>

        <ReferenceDocs docId={props.docId} />

        {hasChecks && (
          <PublishField
            label="Publishing checks"
            help={
              skipChecks
                ? 'Checks will be skipped.'
                : 'Checks run automatically before the doc goes live.'
            }
            action={
              <Button
                variant="subtle"
                color="dark"
                size="xs"
                compact
                leftIcon={<IconPlayerPlay size={13} stroke={1.75} />}
                loading={checksRunning}
                onClick={() => previewChecks()}
              >
                {checkResults ? 'Run again' : 'Run checks'}
              </Button>
            }
          >
            <PublishChecksList
              docId={props.docId}
              checks={configuredChecks}
              results={checkResults}
              running={checksRunning}
            />
            {publishChecks.isAdmin && (
              <Checkbox
                className="PublishDocModal__skipChecks"
                label="Skip publishing checks (admins only)"
                size="xs"
                checked={skipChecks}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setSkipChecks(e.currentTarget.checked);
                }}
              />
            )}
          </PublishField>
        )}

        {testV2TranslationsEnabled() && (
          <Text size="body-sm" color="gray">
            The doc's translations will be published together with the doc.
          </Text>
        )}

        <div className="PublishDocModal__buttons">
          <Button
            variant="default"
            onClick={() => context.closeModal(id)}
            type="button"
            size="xs"
          >
            Cancel
          </Button>
          <Button
            variant="filled"
            size="xs"
            color="dark"
            disabled={disabled}
            loading={loading || checksRunning}
            leftIcon={
              publishType === 'scheduled' ? (
                <IconCalendarEvent size={15} stroke={1.75} />
              ) : (
                <IconRocket size={15} stroke={1.75} />
              )
            }
            type="submit"
          >
            {checksRunning
              ? 'Running checks'
              : publishType === 'scheduled'
                ? 'Schedule publish'
                : 'Publish'}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** A toggle button for choosing how the doc is published. */
function PublishTypeButton(props: {
  selected: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      className={joinClassNames(
        'PublishDocModal__type',
        props.selected && 'PublishDocModal__type--selected'
      )}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

/** A labeled section of the publish form. */
function PublishField(props: {
  label: string;
  help?: string;
  action?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <div className="PublishDocModal__field">
      <div className="PublishDocModal__field__header">
        <div className="PublishDocModal__field__label">{props.label}</div>
        {props.action && (
          <div className="PublishDocModal__field__action">{props.action}</div>
        )}
      </div>
      {props.help && (
        <div className="PublishDocModal__field__help">{props.help}</div>
      )}
      {props.children}
    </div>
  );
}

/**
 * Shows what changed between the published doc and the draft, as a JSON diff
 * and, if AI is enabled, a Root AI summary. Nothing loads until the user asks
 * for it.
 */
function ChangesPanel(props: {docId: string; aiAvailable: boolean}) {
  const docId = props.docId;
  const [showDiff, setShowDiff] = useState(false);
  const aiSummary = useAiSummary({
    docId: docId,
    beforeVersion: 'published',
    afterVersion: 'draft',
  });

  return (
    <div className="PublishDocModal__panel">
      <div className="PublishDocModal__row">
        <IconGitCompare
          className="PublishDocModal__row__icon"
          size={17}
          stroke={1.75}
        />
        <div className="PublishDocModal__row__label">Diff</div>
        <div className="PublishDocModal__row__message">
          Compare the draft to the published version.
        </div>
        <Button
          className="PublishDocModal__row__button"
          variant="default"
          size="xs"
          compact
          onClick={() => setShowDiff(!showDiff)}
        >
          {showDiff ? 'Hide diff' : 'View diff'}
        </Button>
      </div>
      {showDiff && (
        <div className="PublishDocModal__row__expanded PublishDocModal__diff">
          <DocDiffViewer
            left={{docId, versionId: 'published'}}
            right={{docId, versionId: 'draft'}}
            showExpandButton={true}
            showAiSummary={false}
          />
        </div>
      )}
      {props.aiAvailable && (
        <>
          <div className="PublishDocModal__row">
            <IconRobot
              className="PublishDocModal__row__icon"
              size={17}
              stroke={1.75}
            />
            <div className="PublishDocModal__row__label">AI summary</div>
            <div className="PublishDocModal__row__message">
              Summarize the changes with Root AI.
            </div>
            <Button
              className="PublishDocModal__row__button"
              variant="default"
              size="xs"
              compact
              loading={aiSummary.status === 'loading'}
              onClick={() => aiSummary.generate()}
            >
              {aiSummary.status === 'success' ? 'Regenerate' : 'Summarize'}
            </Button>
          </div>
          {aiSummary.status !== 'idle' && (
            <div className="PublishDocModal__row__expanded">
              <AiSummaryResult
                status={aiSummary.status}
                summary={aiSummary.summary}
                error={aiSummary.error}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Lists the publishing checks configured on the doc's collection, along with
 * the results of the latest run.
 */
function PublishChecksList(props: {
  docId: string;
  checks: ResolvedPublishCheck[];
  results: PublishCheckResult[] | null;
  running: boolean;
}) {
  return (
    <div className="PublishDocModal__panel">
      {props.checks.map((check) => {
        const result = props.results?.find(
          (r) => r.docId === props.docId && r.checkId === check.id
        );
        return (
          <div className="PublishDocModal__row" key={check.id}>
            <span className="PublishDocModal__row__icon">
              <CheckStatusIcon
                result={result}
                level={check.level}
                running={props.running}
              />
            </span>
            <div className="PublishDocModal__row__label">{check.label}</div>
            <div className="PublishDocModal__row__message">
              {result ? (
                <Markdown
                  className="PublishDocModal__row__markdown"
                  code={result.message}
                />
              ) : props.running ? (
                'Running...'
              ) : (
                check.description || 'Not run yet.'
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The status icon for a single publishing check. */
function CheckStatusIcon(props: {
  result?: PublishCheckResult;
  level: 'required' | 'warning';
  running: boolean;
}) {
  if (props.running) {
    return <Loader size={15} color="gray" />;
  }
  const result = props.result;
  if (!result) {
    return <IconCircleDashed size={17} stroke={1.75} color="#adb5bd" />;
  }
  if (result.status === 'success') {
    return <IconCircleCheck size={17} stroke={1.75} color="#2f9e44" />;
  }
  // Errors from warning-level checks don't block publishing, so they're shown
  // as warnings.
  if (result.status === 'error' && props.level === 'required') {
    return <IconCircleX size={17} stroke={1.75} color="#e03131" />;
  }
  return <IconAlertTriangle size={17} stroke={1.75} color="#f08c00" />;
}

/** Checks if a doc has unpublished changes (draft is newer than published). */
function docHasUnpublishedChanges(doc: any): boolean {
  const sys = doc?.sys;
  if (!sys) {
    return false;
  }
  if (!sys.publishedAt) {
    return true;
  }
  if (sys.modifiedAt && sys.modifiedAt > sys.publishedAt) {
    return true;
  }
  return false;
}

/**
 * Shows referenced docs with unpublished changes and provides an option to
 * add all docs to a release.
 */
function ReferenceDocs(props: {docId: string}) {
  const [loading, setLoading] = useState(true);
  const [unpublishedRefDocs, setUnpublishedRefDocs] = useState<string[]>([]);

  useEffect(() => {
    async function fetchReferences() {
      setLoading(true);
      try {
        const docData = await getDocFromCacheOrFetch(props.docId);
        if (!docData?.fields) {
          setLoading(false);
          return;
        }
        const refDocIds = extractReferenceDocIds(docData.fields).filter(
          (id) => id !== props.docId
        );
        if (refDocIds.length === 0) {
          setLoading(false);
          return;
        }
        // Fetch each referenced doc to check for unpublished changes.
        const unpublished: string[] = [];
        await Promise.all(
          refDocIds.map(async (refId) => {
            try {
              const refDoc = await getDocFromCacheOrFetch(refId);
              if (refDoc && docHasUnpublishedChanges(refDoc)) {
                unpublished.push(refId);
              }
            } catch (err) {
              // Skip docs that fail to load (e.g. deleted references).
              console.warn(`Failed to fetch reference doc: ${refId}`, err);
            }
          })
        );
        setUnpublishedRefDocs(unpublished.sort());
      } catch (err) {
        console.error('Failed to load reference docs', err);
      }
      setLoading(false);
    }
    fetchReferences();
  }, [props.docId]);

  const allDocIds = [props.docId, ...unpublishedRefDocs];
  const addToReleaseModal = useAddToReleaseModal({docIds: allDocIds});

  if (loading || unpublishedRefDocs.length === 0) {
    return null;
  }

  const count = unpublishedRefDocs.length;
  return (
    <PublishField label="Referenced docs">
      <div className="PublishDocModal__panel">
        <div className="PublishDocModal__row">
          <IconAlertTriangle
            className="PublishDocModal__row__icon"
            size={17}
            stroke={1.75}
            color="#f08c00"
          />
          <div className="PublishDocModal__row__message PublishDocModal__row__message--wide">
            {count === 1
              ? '1 referenced doc has unpublished changes.'
              : `${count} referenced docs have unpublished changes.`}
          </div>
          <Button
            className="PublishDocModal__row__button"
            variant="default"
            size="xs"
            compact
            onClick={() => addToReleaseModal.open()}
          >
            Bundle into a release
          </Button>
        </div>
        <div className="PublishDocModal__refDocs">
          {unpublishedRefDocs.map((refId) => (
            <DocPreviewCard
              key={refId}
              docId={refId}
              variant="compact"
              statusBadges
              clickable
            />
          ))}
        </div>
      </div>
    </PublishField>
  );
}

PublishDocModal.id = MODAL_ID;
