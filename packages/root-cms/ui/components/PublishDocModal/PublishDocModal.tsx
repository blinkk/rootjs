import './PublishDocModal.css';

import {Accordion, Button, Checkbox, Loader, Tooltip} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {
  IconChecklist,
  IconGitCompare,
  IconPackage,
  IconSparkles,
} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useState, useRef, useEffect} from 'preact/hooks';
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
import {getCollectionPublishChecks} from '../../utils/publish-checks.js';
import {extractReferenceDocIds} from '../../utils/references.js';
import {getLocalISOString} from '../../utils/time.js';
import {testV2TranslationsEnabled} from '../../utils/translations-manager.js';
import {useAddToReleaseModal} from '../AddToReleaseModal/AddToReleaseModal.js';
import {AiSummary} from '../AiSummary/AiSummary.js';
import {DocDiffViewer} from '../DocDiffViewer/DocDiffViewer.js';
import {DocIdBadge} from '../DocIdBadge/DocIdBadge.js';
import {DocPreviewCard} from '../DocPreviewCard/DocPreviewCard.js';
import {Text} from '../Text/Text.js';

const MODAL_ID = 'PublishDocModal';

export type PublishType = 'now' | 'scheduled' | '';

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
        title: `Publish ${props.docId}`,
        innerProps: props,
        size: '850px',
      });
    },
  };
}

export function PublishDocModal(
  modalProps: ContextModalProps<PublishDocModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const [publishType, setPublishType] = useState<PublishType>('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');
  const [generatingMessage, setGeneratingMessage] = useState(false);
  const [skipChecks, setSkipChecks] = useState(false);
  const [checksRunning, setChecksRunning] = useState(false);
  const dateTimeRef = useRef<HTMLInputElement>(null);
  const modals = useModals();
  const modalTheme = useModalTheme();
  const aiAvailable = testAiEnabled();

  const {roles, loading: rolesLoading} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);

  const publishChecks = usePublishChecks();
  const collectionId = props.docId.split('/')[0];
  const configuredChecks = getCollectionPublishChecks(collectionId);
  const hasChecks = configuredChecks.length > 0;

  const buttonLabel = publishType === 'scheduled' ? 'Schedule' : 'Publish';

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

  let disabled = true;
  if (publishType === 'now') {
    disabled = false;
  } else if (publishType === 'scheduled' && scheduledDate) {
    disabled = false;
  }

  if (rolesLoading || !canPublish) {
    disabled = true;
  }

  return (
    <div className="PublishDocModal">
      <div className="PublishDocModal__content">
        <form
          className="PublishDocModal__form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="PublishDocModal__form__publishOptions">
            <div className="PublishDocModal__form__publishOptions__options">
              <label
                className={joinClassNames(
                  'PublishDocModal__form__publishOptions__option',
                  publishType === 'now' &&
                    'PublishDocModal__form__publishOptions__option--selected',
                  publishType &&
                    publishType !== 'now' &&
                    'PublishDocModal__form__publishOptions__option--unselected'
                )}
              >
                <div className="PublishDocModal__form__publishOptions__option__input">
                  <input
                    type="radio"
                    name="publish-option"
                    value="now"
                    checked={publishType === 'now'}
                    onChange={() => setPublishType('now')}
                  />{' '}
                  Now
                </div>
                <div className="PublishDocModal__form__publishOptions__option__help">
                  Content will go live immediately.
                </div>
              </label>

              <label
                className={joinClassNames(
                  'PublishDocModal__form__publishOptions__option',
                  publishType === 'scheduled' &&
                    'PublishDocModal__form__publishOptions__option--selected',
                  publishType &&
                    publishType !== 'scheduled' &&
                    'PublishDocModal__form__publishOptions__option--unselected'
                )}
              >
                <div className="PublishDocModal__form__publishOptions__option__input">
                  <input
                    type="radio"
                    name="publish-option"
                    value="scheduled"
                    checked={publishType === 'scheduled'}
                    onChange={() => setPublishType('scheduled')}
                  />
                  <div>Scheduled</div>
                </div>
                <div className="PublishDocModal__form__publishOptions__option__help">
                  Content will go live at the date and time specified below.
                </div>
                <div className="PublishDocModal__form__publishOptions__option__input2">
                  <input
                    ref={dateTimeRef}
                    type="datetime-local"
                    disabled={publishType !== 'scheduled'}
                    value={scheduledDate}
                    min={getLocalISOString()}
                    onChange={(e: Event) => {
                      const target = e.target as HTMLInputElement;
                      setScheduledDate(target.value);
                    }}
                  />
                  <div className="PublishDocModal__form__publishOptions__option__input2__help">
                    timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {testV2TranslationsEnabled() && (
            <div className="PublishDocModal__form__translationsNote">
              <Text size="body-sm" color="gray">
                The doc's translations will be published together with the doc.
              </Text>
            </div>
          )}

          {hasChecks && (
            <div className="PublishDocModal__form__checks">
              <div className="PublishDocModal__form__checks__note">
                <IconChecklist size={16} stroke={1.5} />
                <Text size="body-sm" color="gray">
                  {configuredChecks.length} publishing check
                  {configuredChecks.length === 1 ? '' : 's'} will run first:{' '}
                  {configuredChecks.map((check) => check.label).join(', ')}.
                </Text>
              </div>
              {publishChecks.isAdmin && (
                <Checkbox
                  label="Skip publishing checks (admins only)"
                  size="xs"
                  checked={skipChecks}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setSkipChecks(e.currentTarget.checked);
                  }}
                />
              )}
            </div>
          )}

          <div className="PublishDocModal__form__publishMessage">
            <div className="PublishDocModal__form__publishMessage__wrapper">
              <textarea
                className="PublishDocModal__form__publishMessage__textarea"
                placeholder="Optional: Add a message to describe the changes"
                value={publishMessage}
                rows={3}
                onInput={(e: Event) => {
                  const target = e.target as HTMLTextAreaElement;
                  setPublishMessage(target.value);
                }}
              />
              {aiAvailable && (
                <button
                  type="button"
                  className="PublishDocModal__form__publishMessage__sparkle"
                  onClick={generatePublishMessage}
                  disabled={generatingMessage}
                >
                  <Tooltip
                    label="Generate message"
                    withArrow
                    position="left"
                    allowPointerEvents
                    wrapLines
                  >
                    {generatingMessage ? (
                      <Loader size={16} />
                    ) : (
                      <IconSparkles size={16} stroke={1.5} />
                    )}
                  </Tooltip>
                </button>
              )}
            </div>
          </div>

          <div className="PublishDocModal__form__buttons">
            <Button
              variant="outline"
              onClick={() => context.closeModal(id)}
              type="button"
              size="xs"
              color="dark"
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              size="xs"
              color="dark"
              disabled={disabled}
              loading={loading || checksRunning}
              type="submit"
            >
              {checksRunning ? 'Running checks' : buttonLabel}
            </Button>
          </div>
        </form>
        <div className="PublishDocModal__DiffWrapper">
          <ReferenceDocs docId={props.docId} />
          {aiAvailable && (
            <AiSummary
              docId={props.docId}
              beforeVersion="published"
              afterVersion="draft"
            />
          )}
          <ShowChanges docId={props.docId} />
        </div>
      </div>
    </div>
  );
}

function ShowChanges(props: {docId: string}) {
  const docId = props.docId;
  const [toggled, setToggled] = useState(false);

  function toggle() {
    setToggled(true);
  }

  return (
    <div className="PublishDocModal__ShowChanges">
      <Accordion
        iconPosition="right"
        onChange={() => toggle()}
        disableIconRotation={true}
      >
        <Accordion.Item
          label="Compare JSON data"
          icon={<IconGitCompare stroke={1.5} />}
          iconPosition="left"
        >
          {toggled && (
            <DocDiffViewer
              left={{docId, versionId: 'published'}}
              right={{docId, versionId: 'draft'}}
              showExpandButton={true}
              showAiSummary={false}
            />
          )}
        </Accordion.Item>
      </Accordion>
    </div>
  );
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

  if (loading) {
    return (
      <div className="PublishDocModal__ReferenceDocs">
        <Loader color="gray" size="sm" />
      </div>
    );
  }

  if (unpublishedRefDocs.length === 0) {
    return null;
  }

  return (
    <div className="PublishDocModal__ReferenceDocs">
      <div className="PublishDocModal__ReferenceDocs__header">
        <div className="PublishDocModal__ReferenceDocs__header__label">
          Referenced docs with unpublished changes ({unpublishedRefDocs.length})
        </div>
        <Button
          variant="outline"
          size="xs"
          color="dark"
          leftIcon={<IconPackage size={16} />}
          onClick={() => addToReleaseModal.open()}
        >
          Bundle all docs into a release
        </Button>
      </div>
      <div className="PublishDocModal__ReferenceDocs__list">
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
  );
}

PublishDocModal.id = MODAL_ID;
