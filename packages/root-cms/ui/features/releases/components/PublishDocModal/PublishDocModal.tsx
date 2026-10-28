import './PublishDocModal.css';

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
import {Markdown} from '../../../../components/Markdown/Markdown.js';
import {Text} from '../../../../components/Text/Text.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Checkbox} from '../../../../primitives/Checkbox/Checkbox.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {
  type ContextModalProps,
  useModals,
} from '../../../../primitives/modals/ModalsProvider.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {errorMessage} from '../../../../utils/notifications.js';
import {getLocalISOString} from '../../../../utils/time.js';
import {testAiEnabled} from '../../../ai/ai.js';
import {
  AiSummaryResult,
  useAiSummary,
} from '../../../ai/components/AiSummary/AiSummary.js';
import {DocPreviewCard} from '../../../collections/components/DocPreviewCard/DocPreviewCard.js';
import {DocDiffViewer} from '../../../documents/components/DocDiffViewer/DocDiffViewer.js';
import {DocIdBadge} from '../../../documents/components/DocIdBadge/DocIdBadge.js';
import {getDocFromCacheOrFetch} from '../../../documents/doc-cache.js';
import {cmsPublishDoc, cmsScheduleDoc} from '../../../documents/doc.js';
import {extractReferenceDocIds} from '../../../documents/references.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {
  getCollectionPublishChecks,
  runPublishChecks,
  type PublishCheckResult,
  type ResolvedPublishCheck,
} from '../../publish-checks.js';
import {type Release, generateReleaseId} from '../../release.js';
import {
  usePublishChecks,
  type PublishChecksDecision,
} from '../../usePublishChecks.js';
import {useAddToRelease} from '../AddToReleaseModal/AddToReleaseModal.js';

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
  return {
    open: () => {
      modals.openContextModal(MODAL_ID, {
        title: (
          <ModalTitle icon={<IconRocket size={18} stroke={1.75} />}>
            Publish {props.docId}
          </ModalTitle>
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
      title: `${buttonLabel} ${props.docId}`,
      children: (
        <>
          <Text
            size="body-sm"
            weight="semi-bold"
            className="PublishDocModal__confirmText mb-2 text-pretty"
          >
            Are you sure you want to publish the following doc? The doc will go
            live {publishType === 'now' ? 'now' : `at ${scheduledDate}`}.
          </Text>
          <DocIdBadge docId={props.docId} />
          {(decision.skipped || decision.bypassed) && (
            <Text
              size="body-sm"
              className="PublishDocModal__confirmText mt-2 text-pretty text-danger"
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
    <div className="PublishDocModal text-sm leading-normal text-fg">
      <form
        className="PublishDocModal__form flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div
          className="PublishDocModal__types flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Publish type"
        >
          <PublishTypeButton
            selected={publishType === 'now'}
            onClick={() => setPublishType('now')}
          >
            <IconRocket size={14} stroke={1.75} />
            Publish now
          </PublishTypeButton>
          <PublishTypeButton
            selected={publishType === 'scheduled'}
            onClick={() => setPublishType('scheduled')}
          >
            <IconCalendarEvent size={14} stroke={1.75} />
            Schedule
          </PublishTypeButton>
          <PublishTypeButton
            selected={publishType === 'release'}
            onClick={() => setPublishType('release')}
          >
            <IconPackage size={14} stroke={1.75} />
            Add to release
          </PublishTypeButton>
        </div>

        {publishType === 'scheduled' && (
          <PublishField label="Publish at" help={`Timezone: ${timezone}.`}>
            <TextInput
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
            <div className="PublishDocModal__message relative">
              <Textarea
                className="PublishDocModal__input"
                inputClassName={cn('resize-y', aiAvailable && 'pr-10')}
                placeholder="What changed?"
                aria-label="Publish message"
                value={publishMessage}
                minRows={2}
                onInput={(e: Event) => {
                  const target = e.target as HTMLTextAreaElement;
                  setPublishMessage(target.value);
                  setMessageFromAi(false);
                }}
              />
              {aiAvailable && (
                <div className="PublishDocModal__messageAction absolute right-1.5 top-1.5">
                  <IconButton
                    variant="default"
                    size="xs"
                    label="Suggest a publish message with Root AI"
                    tooltipPlacement="left"
                    loading={generatingMessage}
                    onClick={() => generatePublishMessage()}
                  >
                    <IconRobot stroke={1.75} />
                  </IconButton>
                </div>
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
                size="xs"
                icon={<IconPlayerPlay stroke={1.75} />}
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
                className="PublishDocModal__skipChecks mt-1"
                label="Skip publishing checks (admins only)"
                checked={skipChecks}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setSkipChecks(e.currentTarget.checked);
                }}
              />
            )}
          </PublishField>
        )}

        <div className="PublishDocModal__buttons mt-1 flex justify-end gap-2">
          <Button onClick={() => context.closeModal(id)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={disabled}
            loading={loading || checksRunning || releaseActions.submitting}
            icon={
              publishType === 'scheduled' ? (
                <IconCalendarEvent stroke={1.75} />
              ) : publishType === 'release' ? (
                <IconPackage stroke={1.75} />
              ) : (
                <IconRocket stroke={1.75} />
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

/** A modal title with a leading icon. */
function ModalTitle(props: {
  icon: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <span className="PublishDocModal__title flex min-w-0 items-center gap-2">
      <span className="PublishDocModal__titleIcon flex shrink-0">
        {props.icon}
      </span>
      <span className="PublishDocModal__titleText wrap-anywhere">
        {props.children}
      </span>
    </span>
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
      className={cn(
        'PublishDocModal__type',
        props.selected && 'PublishDocModal__type--selected',
        'm-0 inline-flex h-control-sm cursor-pointer appearance-none items-center gap-1.5 whitespace-nowrap rounded-sm border border-solid px-3 font-sans text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        props.selected
          ? 'border-info-line bg-info-soft text-info'
          : 'border-border-strong bg-surface text-fg hover:bg-surface-hover'
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
    <div className="PublishDocModal__field flex flex-col gap-1.5">
      <div className="PublishDocModal__fieldHeader flex min-h-6 items-center justify-between gap-2">
        <div className="PublishDocModal__fieldLabel text-sm font-semibold">
          {props.label}
        </div>
        {props.action && (
          <div className="PublishDocModal__fieldAction">{props.action}</div>
        )}
      </div>
      {props.help && (
        <div className="PublishDocModal__fieldHelp -mt-1 text-xs text-muted">
          {props.help}
        </div>
      )}
      {props.children}
    </div>
  );
}

/** A bordered box of `Row`s, used for the changes, checks and releases. */
function Panel(props: {
  className?: string;
  children: ComponentChildren;
  [key: string]: unknown;
}) {
  const {className, children, ...rest} = props;
  return (
    <div
      {...rest}
      className={cn(
        'PublishDocModal__panel overflow-hidden rounded-lg border border-solid border-border bg-surface',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Classes shared by `Row` and `ReleaseOption`. */
const ROW_CLASSES =
  'PublishDocModal__row flex min-h-10 items-center gap-2.5 border-0 border-t border-solid border-surface-active px-3 py-2 first:border-t-0';

/**
 * A line in a `Panel`: an icon, a label, a message and an optional action.
 * Below `sm` the message moves under the label.
 */
function Row(props: {
  icon: ComponentChildren;
  label?: string;
  message: ComponentChildren;
  messageClassName?: string;
  action?: ComponentChildren;
}) {
  return (
    <div className={cn(ROW_CLASSES, 'max-sm:flex-wrap')}>
      <span className="PublishDocModal__rowIcon flex w-4 shrink-0 items-center justify-center">
        {props.icon}
      </span>
      {props.label && (
        <div className="PublishDocModal__rowLabel shrink-0 font-semibold max-sm:min-w-0 max-sm:flex-1 sm:w-32">
          {props.label}
        </div>
      )}
      <div
        className={cn(
          'PublishDocModal__rowMessage min-w-0 flex-1 text-muted wrap-anywhere',
          props.label && 'max-sm:order-last max-sm:basis-full max-sm:pl-6',
          props.messageClassName
        )}
      >
        {props.message}
      </div>
      {props.action && (
        <div className="PublishDocModal__rowAction shrink-0">
          {props.action}
        </div>
      )}
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
    <Panel>
      <Row
        icon={<IconGitCompare size={16} stroke={1.75} />}
        label="Diff"
        message="Compare the draft to the published version."
        action={
          <Button size="xs" onClick={() => setDiffOpen(true)}>
            View diff
          </Button>
        }
      />
      {props.aiAvailable && (
        <Row
          icon={<IconRobot size={16} stroke={1.75} />}
          label="AI summary"
          message="Summarize the changes with Root AI."
          action={
            <Button size="xs" onClick={() => openSummary()}>
              {hasSummary ? 'View summary' : 'Summarize'}
            </Button>
          }
        />
      )}

      <Dialog
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        title={
          <ModalTitle icon={<IconGitCompare size={18} stroke={1.75} />}>
            Changes to {docId}
          </ModalTitle>
        }
        size="min(calc(100% - 32px), 900px)"
      >
        <DocDiffViewer
          className="PublishDocModal__diff"
          diffClassName="min-h-0"
          left={{docId, versionId: 'published'}}
          right={{docId, versionId: 'draft'}}
          showExpandButton={true}
          showAiSummary={false}
        />
      </Dialog>

      <Dialog
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title={
          <ModalTitle icon={<IconRobot size={18} stroke={1.75} />}>
            AI summary of changes
          </ModalTitle>
        }
        size="640px"
        footer={
          <>
            <Button
              icon={<IconRobot stroke={1.75} />}
              disabled={aiSummary.status === 'loading'}
              onClick={() => aiSummary.generate()}
            >
              Regenerate
            </Button>
            <Button variant="primary" onClick={() => setSummaryOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        <div className="PublishDocModal__summary flex flex-col gap-3 text-sm leading-normal">
          <Text size="body-sm" color="gray">
            Root AI compared the draft of {docId} to the published version.
            Review the summary before relying on it.
          </Text>
          <div className="PublishDocModal__summaryBody min-h-16 rounded-lg border border-solid border-border px-4 py-3">
            <AiSummaryResult
              className="pt-0"
              status={aiSummary.status}
              summary={aiSummary.summary}
              error={aiSummary.error}
            />
          </div>
        </div>
      </Dialog>
    </Panel>
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
    <Panel>
      {props.checks.map((check) => {
        const result = props.results?.find(
          (r) => r.docId === props.docId && r.checkId === check.id
        );
        return (
          <Row
            key={check.id}
            icon={
              <CheckStatusIcon
                result={result}
                level={check.level}
                running={props.running}
              />
            }
            label={check.label}
            message={
              result ? (
                <Markdown
                  className="PublishDocModal__markdown"
                  code={result.message}
                />
              ) : props.running ? (
                'Running...'
              ) : (
                check.description || 'Not run yet.'
              )
            }
          />
        );
      })}
    </Panel>
  );
}

/** The status icon for a single publishing check. */
function CheckStatusIcon(props: {
  result?: PublishCheckResult;
  level: 'required' | 'warning';
  running: boolean;
}) {
  if (props.running) {
    return <Spinner size="sm" className="text-muted" />;
  }
  const result = props.result;
  if (!result) {
    return <IconCircleDashed className="text-subtle" size={16} stroke={1.75} />;
  }
  if (result.status === 'success') {
    return <IconCircleCheck className="text-success" size={16} stroke={1.75} />;
  }
  // Errors from warning-level checks don't block publishing, so they're shown
  // as warnings.
  if (result.status === 'error' && props.level === 'required') {
    return <IconCircleX className="text-danger" size={16} stroke={1.75} />;
  }
  return <IconAlertTriangle className="text-warning" size={16} stroke={1.75} />;
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
      <Panel>
        <Row
          icon={
            <IconAlertTriangle
              className="text-warning"
              size={16}
              stroke={1.75}
            />
          }
          message={
            count === 1
              ? '1 referenced doc has unpublished changes.'
              : `${count} referenced docs have unpublished changes.`
          }
          messageClassName="text-fg"
          action={
            <Button size="xs" onClick={() => props.onBundle()}>
              Bundle into a release
            </Button>
          }
        />
        <DocList docIds={props.docIds} indent />
      </Panel>
    </PublishField>
  );
}

/**
 * A compact list of doc preview cards. `indent` lines the cards up under the
 * text of the row above them.
 */
function DocList(props: {docIds: string[]; indent?: boolean}) {
  return (
    <div
      className={cn(
        'PublishDocModal__docs flex flex-col divide-y divide-surface-active border-0 border-solid border-surface-active not-first:border-t',
        props.indent && 'PublishDocModal__docs--indent'
      )}
    >
      {props.docIds.map((docId) => (
        <DocPreviewCard
          key={docId}
          className={props.indent ? 'pl-9 pr-3' : 'px-3'}
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
        <Panel role="radiogroup" aria-label="Release">
          {(props.loading || props.releases.length > 0) && (
            <div className="PublishDocModal__releases max-h-52 overflow-y-auto">
              {props.loading ? (
                <Row
                  icon={<Spinner size="sm" className="text-muted" />}
                  message="Loading releases..."
                />
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
            <div className="PublishDocModal__newRelease flex flex-col gap-3 pb-3 pl-9 pr-3 pt-1">
              <TextInput
                className="PublishDocModal__newReleaseId"
                label="Release ID"
                placeholder="e.g. my-release"
                value={props.newReleaseId}
                onInput={(e: Event) => {
                  props.onNewReleaseIdChange(
                    (e.target as HTMLInputElement).value
                  );
                }}
              />
              <Textarea
                className="PublishDocModal__newReleaseDescription"
                inputClassName="resize-y"
                label="Description (optional)"
                minRows={2}
                placeholder="Describe this release"
                value={props.newReleaseDescription}
                onInput={(e: Event) => {
                  props.onNewReleaseDescriptionChange(
                    (e.target as HTMLTextAreaElement).value
                  );
                }}
              />
            </div>
          )}
        </Panel>
      </PublishField>

      <PublishField label={`Docs to add (${props.docIds.length})`}>
        <Panel>
          <DocList docIds={props.docIds} />
        </Panel>
        {refCount > 0 && (
          <Checkbox
            className="PublishDocModal__includeRefs mt-1"
            label={
              refCount === 1
                ? 'Include 1 referenced doc with unpublished changes'
                : `Include ${refCount} referenced docs with unpublished changes`
            }
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
      className={cn(
        ROW_CLASSES,
        'PublishDocModal__row--option',
        props.selected && 'PublishDocModal__row--selected',
        'cursor-pointer',
        props.selected ? 'bg-info-soft' : 'hover:bg-surface-hover'
      )}
    >
      <input
        className="PublishDocModal__rowIcon m-0 w-4 shrink-0 cursor-pointer accent-primary"
        type="radio"
        name="publish-release"
        checked={props.selected}
        onChange={() => props.onSelect()}
      />
      <div className="PublishDocModal__rowLabel max-w-1/2 shrink-0 truncate font-semibold">
        {props.label}
      </div>
      <div className="PublishDocModal__rowMessage min-w-0 flex-1 truncate text-muted">
        {props.message}
      </div>
      {props.meta && (
        <div className="PublishDocModal__rowMeta shrink-0 text-xs text-muted">
          {props.meta}
        </div>
      )}
    </label>
  );
}

PublishDocModal.id = MODAL_ID;
