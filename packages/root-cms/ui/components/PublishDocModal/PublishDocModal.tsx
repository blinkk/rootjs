import './PublishDocModal.css';

import {
  ActionIcon,
  Button,
  Checkbox,
  Loader,
  Modal,
  Tooltip,
} from '@mantine/core';
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
import {type Release, generateReleaseId} from '../../utils/release.js';
import {getLocalISOString} from '../../utils/time.js';
import {testV2TranslationsEnabled} from '../../utils/translations-manager.js';
import {useAddToRelease} from '../AddToReleaseModal/AddToReleaseModal.js';
import {AiSummaryResult, useAiSummary} from '../AiSummary/AiSummary.js';
import {DocDiffViewer} from '../DocDiffViewer/DocDiffViewer.js';
import {DocIdBadge} from '../DocIdBadge/DocIdBadge.js';
import {DocPreviewCard} from '../DocPreviewCard/DocPreviewCard.js';
import {Markdown} from '../Markdown/Markdown.js';
import {Text} from '../Text/Text.js';

const MODAL_ID = 'PublishDocModal';

export type PublishType = 'now' | 'scheduled' | 'release';

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
  const isRelease = publishType === 'release';
  const [releaseChoice, setReleaseChoice] = useState('');
  const [newReleaseId, setNewReleaseId] = useState(() => generateReleaseId());
  const [newReleaseDescription, setNewReleaseDescription] = useState('');
  const [includeRefDocs, setIncludeRefDocs] = useState(false);
  // Releases are only loaded once the "Add to release" tab is opened.
  const [releaseTabOpened, setReleaseTabOpened] = useState(false);
  const releaseActions = useAddToRelease({enabled: releaseTabOpened});
  const refDocs = useUnpublishedReferences(props.docId);
  const releaseDocIds = includeRefDocs
    ? [props.docId, ...refDocs.docIds]
    : [props.docId];

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
    if (publishType === 'release') {
      setReleaseTabOpened(true);
    }
  }, [publishType]);

  // Default to creating a new release when there are none to add to.
  useEffect(() => {
    if (
      releaseActions.loaded &&
      releaseActions.releases.length === 0 &&
      !releaseChoice
    ) {
      setReleaseChoice(NEW_RELEASE);
    }
  }, [releaseActions.loaded]);

  async function submitRelease() {
    const success =
      releaseChoice === NEW_RELEASE
        ? await releaseActions.createRelease(
            newReleaseId.trim(),
            releaseDocIds,
            newReleaseDescription.trim()
          )
        : await releaseActions.addToRelease(releaseChoice, releaseDocIds);
    if (success) {
      modals.closeAll();
    }
  }

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
    if (isRelease) {
      await submitRelease();
      return;
    }
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
  if (isRelease) {
    disabled =
      !releaseChoice || (releaseChoice === NEW_RELEASE && !newReleaseId.trim());
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function getSubmitLabel() {
    if (publishType === 'release') {
      return releaseChoice === NEW_RELEASE
        ? 'Create release'
        : 'Add to release';
    }
    if (checksRunning) {
      return 'Running checks';
    }
    return publishType === 'scheduled' ? 'Schedule publish' : 'Publish';
  }

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
          <PublishTypeButton
            selected={publishType === 'release'}
            onClick={() => setPublishType('release')}
          >
            <IconPackage size={15} stroke={1.75} />
            Add to release
          </PublishTypeButton>
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

        {isRelease && (
          <ReleaseFields
            releases={releaseActions.releases}
            loading={releaseActions.loading || !releaseActions.loaded}
            choice={releaseChoice}
            onChoiceChange={setReleaseChoice}
            newReleaseId={newReleaseId}
            onNewReleaseIdChange={setNewReleaseId}
            newReleaseDescription={newReleaseDescription}
            onNewReleaseDescriptionChange={setNewReleaseDescription}
            docIds={releaseDocIds}
            refDocIds={refDocs.docIds}
            includeRefDocs={includeRefDocs}
            onIncludeRefDocsChange={setIncludeRefDocs}
          />
        )}

        {!isRelease && (
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
        )}

        <PublishField label="Changes">
          <ChangesPanel docId={props.docId} aiAvailable={aiAvailable} />
        </PublishField>

        {!isRelease && (
          <ReferenceDocs
            docIds={refDocs.docIds}
            onBundle={() => {
              setIncludeRefDocs(true);
              setPublishType('release');
            }}
          />
        )}

        {!isRelease && hasChecks && (
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

        {!isRelease && testV2TranslationsEnabled() && (
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
            loading={loading || checksRunning || releaseActions.submitting}
            leftIcon={
              publishType === 'scheduled' ? (
                <IconCalendarEvent size={15} stroke={1.75} />
              ) : publishType === 'release' ? (
                <IconPackage size={15} stroke={1.75} />
              ) : (
                <IconRocket size={15} stroke={1.75} />
              )
            }
            type="submit"
          >
            {getSubmitLabel()}
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
 * and, if AI is enabled, a Root AI summary. Each opens in a modal on top of the
 * publish modal, and nothing loads until the user asks for it.
 */
function ChangesPanel(props: {docId: string; aiAvailable: boolean}) {
  const docId = props.docId;
  const [diffOpen, setDiffOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const modalTheme = useModalTheme();
  // Kept here rather than in the summary modal so that closing and reopening
  // the modal shows the same summary instead of running Root AI again.
  const aiSummary = useAiSummary({
    docId: docId,
    beforeVersion: 'published',
    afterVersion: 'draft',
  });
  const hasSummary =
    aiSummary.status === 'success' || aiSummary.status === 'loading';

  function openSummary() {
    if (!hasSummary) {
      aiSummary.generate();
    }
    setSummaryOpen(true);
  }

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
          onClick={() => setDiffOpen(true)}
        >
          View diff
        </Button>
      </div>
      {props.aiAvailable && (
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
            onClick={() => openSummary()}
          >
            {hasSummary ? 'View summary' : 'Summarize'}
          </Button>
        </div>
      )}

      <Modal
        {...modalTheme}
        opened={diffOpen}
        onClose={() => setDiffOpen(false)}
        title={
          <span className="PublishDocModal__title">
            <IconGitCompare size={18} stroke={1.75} />
            <span className="PublishDocModal__title__text">
              Changes to {docId}
            </span>
          </span>
        }
        size="min(calc(100% - 32px), 900px)"
        overflow="inside"
      >
        <DocDiffViewer
          className="PublishDocModal__diff"
          left={{docId, versionId: 'published'}}
          right={{docId, versionId: 'draft'}}
          showExpandButton={true}
          showAiSummary={false}
        />
      </Modal>

      <Modal
        {...modalTheme}
        opened={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title={
          <span className="PublishDocModal__title">
            <IconRobot size={18} stroke={1.75} />
            <span className="PublishDocModal__title__text">
              AI summary of changes
            </span>
          </span>
        }
        size="640px"
      >
        <div className="PublishDocModal__summary">
          <Text size="body-sm" color="gray">
            Root AI compared the draft of {docId} to the published version.
            Review the summary before relying on it.
          </Text>
          <div className="PublishDocModal__summary__body">
            <AiSummaryResult
              status={aiSummary.status}
              summary={aiSummary.summary}
              error={aiSummary.error}
            />
          </div>
          <div className="PublishDocModal__buttons">
            <Button
              variant="default"
              size="xs"
              leftIcon={<IconRobot size={15} stroke={1.75} />}
              disabled={aiSummary.status === 'loading'}
              onClick={() => aiSummary.generate()}
            >
              Regenerate
            </Button>
            <Button
              variant="filled"
              color="dark"
              size="xs"
              onClick={() => setSummaryOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>
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

/** Loads the docs referenced by a doc that have unpublished changes. */
function useUnpublishedReferences(docId: string) {
  const [loading, setLoading] = useState(true);
  const [docIds, setDocIds] = useState<string[]>([]);

  useEffect(() => {
    async function fetchReferences() {
      setLoading(true);
      try {
        const docData = await getDocFromCacheOrFetch(docId);
        const refDocIds = docData?.fields
          ? extractReferenceDocIds(docData.fields).filter((id) => id !== docId)
          : [];
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
        setDocIds(unpublished.sort());
      } catch (err) {
        console.error('Failed to load reference docs', err);
      }
      setLoading(false);
    }
    fetchReferences();
  }, [docId]);

  return {loading, docIds};
}

/**
 * Shows referenced docs with unpublished changes and provides an option to
 * bundle them into a release with the doc.
 */
function ReferenceDocs(props: {docIds: string[]; onBundle: () => void}) {
  const count = props.docIds.length;
  if (count === 0) {
    return null;
  }
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
            onClick={() => props.onBundle()}
          >
            Bundle into a release
          </Button>
        </div>
        <DocList docIds={props.docIds} />
      </div>
    </PublishField>
  );
}

/** A compact list of doc preview cards. */
function DocList(props: {docIds: string[]}) {
  return (
    <div className="PublishDocModal__docs">
      {props.docIds.map((docId) => (
        <DocPreviewCard
          key={docId}
          docId={docId}
          variant="compact"
          statusBadges
          clickable
        />
      ))}
    </div>
  );
}

/** Value of `releaseChoice` when the user is creating a new release. */
const NEW_RELEASE = '__new__';

interface ReleaseFieldsProps {
  releases: Release[];
  loading: boolean;
  /** The selected release ID, or `NEW_RELEASE`. */
  choice: string;
  onChoiceChange: (choice: string) => void;
  newReleaseId: string;
  onNewReleaseIdChange: (id: string) => void;
  newReleaseDescription: string;
  onNewReleaseDescriptionChange: (description: string) => void;
  /** The docs that will be added to the release. */
  docIds: string[];
  /** Referenced docs with unpublished changes. */
  refDocIds: string[];
  includeRefDocs: boolean;
  onIncludeRefDocsChange: (include: boolean) => void;
}

/** The fields of the publish modal's "Add to release" tab. */
function ReleaseFields(props: ReleaseFieldsProps) {
  const refCount = props.refDocIds.length;
  return (
    <>
      <PublishField
        label="Release"
        help="Docs in a release go live together when the release is published."
      >
        <div
          className="PublishDocModal__panel"
          role="radiogroup"
          aria-label="Release"
        >
          {(props.loading || props.releases.length > 0) && (
            <div className="PublishDocModal__releases">
              {props.loading ? (
                <div className="PublishDocModal__row">
                  <span className="PublishDocModal__row__icon">
                    <Loader size={15} color="gray" />
                  </span>
                  <div className="PublishDocModal__row__message">
                    Loading releases...
                  </div>
                </div>
              ) : (
                props.releases.map((release) => (
                  <ReleaseOption
                    key={release.id}
                    selected={props.choice === release.id}
                    onSelect={() => props.onChoiceChange(release.id)}
                    label={release.id}
                    message={release.description || ''}
                    meta={`${release.docIds?.length || 0} doc(s)`}
                  />
                ))
              )}
            </div>
          )}
          <ReleaseOption
            selected={props.choice === NEW_RELEASE}
            onSelect={() => props.onChoiceChange(NEW_RELEASE)}
            label="New release"
            message={
              !props.loading && props.releases.length === 0
                ? 'There are no unpublished releases. Create one with these docs.'
                : 'Create a new release with these docs.'
            }
          />
          {props.choice === NEW_RELEASE && (
            <div className="PublishDocModal__newRelease">
              <label className="PublishDocModal__newRelease__field">
                <span className="PublishDocModal__field__label">
                  Release ID
                </span>
                <input
                  className="PublishDocModal__input"
                  type="text"
                  placeholder="e.g. my-release"
                  value={props.newReleaseId}
                  onInput={(e: Event) => {
                    props.onNewReleaseIdChange(
                      (e.target as HTMLInputElement).value
                    );
                  }}
                />
              </label>
              <label className="PublishDocModal__newRelease__field">
                <span className="PublishDocModal__field__label">
                  Description (optional)
                </span>
                <textarea
                  className="PublishDocModal__input PublishDocModal__input--textarea"
                  rows={2}
                  placeholder="Describe this release"
                  value={props.newReleaseDescription}
                  onInput={(e: Event) => {
                    props.onNewReleaseDescriptionChange(
                      (e.target as HTMLTextAreaElement).value
                    );
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </PublishField>

      <PublishField label={`Docs to add (${props.docIds.length})`}>
        <div className="PublishDocModal__panel">
          <DocList docIds={props.docIds} />
        </div>
        {refCount > 0 && (
          <Checkbox
            className="PublishDocModal__includeRefs"
            label={
              refCount === 1
                ? 'Include 1 referenced doc with unpublished changes'
                : `Include ${refCount} referenced docs with unpublished changes`
            }
            size="xs"
            checked={props.includeRefDocs}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              props.onIncludeRefDocsChange(e.currentTarget.checked);
            }}
          />
        )}
      </PublishField>
    </>
  );
}

/** A selectable row in the list of releases. */
function ReleaseOption(props: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  message: string;
  meta?: string;
}) {
  return (
    <label
      className={joinClassNames(
        'PublishDocModal__row',
        'PublishDocModal__row--option',
        props.selected && 'PublishDocModal__row--selected'
      )}
    >
      <input
        className="PublishDocModal__row__icon"
        type="radio"
        name="publish-release"
        checked={props.selected}
        onChange={() => props.onSelect()}
      />
      <div className="PublishDocModal__row__label PublishDocModal__row__label--auto">
        {props.label}
      </div>
      <div className="PublishDocModal__row__message PublishDocModal__row__message--truncate">
        {props.message}
      </div>
      {props.meta && (
        <div className="PublishDocModal__row__meta">{props.meta}</div>
      )}
    </label>
  );
}

PublishDocModal.id = MODAL_ID;
