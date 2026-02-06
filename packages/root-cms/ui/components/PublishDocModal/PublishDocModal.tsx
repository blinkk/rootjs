import './PublishDocModal.css';

import {Accordion, Button, Loader, Tooltip} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {IconGitCompare, IconSparkles} from '@tabler/icons-preact';
import {useState, useRef} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {joinClassNames} from '../../utils/classes.js';
import {cmsPublishDoc, cmsScheduleDoc} from '../../utils/doc.js';
import {testCanPublish} from '../../utils/permissions.js';
import {getLocalISOString} from '../../utils/time.js';
import {AiSummary} from '../AiSummary/AiSummary.js';
import {DocDiffViewer} from '../DocDiffViewer/DocDiffViewer.js';
import {DocIdBadge} from '../DocIdBadge/DocIdBadge.js';
import {Text} from '../Text/Text.js';

const MODAL_ID = 'PublishDocModal';

export type PublishType = 'now' | 'scheduled' | '';

export interface PublishDocModalProps {
  [key: string]: unknown;
  docId: string;
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
  const dateTimeRef = useRef<HTMLInputElement>(null);
  const modals = useModals();
  const modalTheme = useModalTheme();
  const experiments = window.__ROOT_CTX.experiments || {};

  const {roles, loading: rolesLoading} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);

  const buttonLabel = publishType === 'scheduled' ? 'Schedule' : 'Publish';

  async function publish() {
    try {
      setLoading(true);
      await cmsPublishDoc(props.docId, {
        publishMessage: publishMessage.trim() || undefined,
      });
      setLoading(false);
      showNotification({
        title: 'Published!',
        message: `Succesfully published ${props.docId}.`,
        autoClose: 10000,
      });
      modals.closeAll();
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Publish failed',
        message: `Failed to publish ${props.docId}.`,
        color: 'red',
        autoClose: false,
      });
    }
  }

  async function schedule() {
    try {
      setLoading(true);
      const millis = Math.floor(new Date(scheduledDate).getTime());
      await cmsScheduleDoc(props.docId, millis, {
        publishMessage: publishMessage.trim() || undefined,
      });
      setLoading(false);
      showNotification({
        title: 'Scheduled!',
        message: `${props.docId} will go live ${scheduledDate}.`,
        autoClose: 10000,
      });
      modals.closeAll();
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Schedule failed',
        message: `Failed to schedule ${props.docId}.`,
        color: 'red',
        autoClose: false,
      });
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

  function onSubmit() {
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
        </>
      ),
      labels: {confirm: buttonLabel, cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'dark', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: true,
      onConfirm: () => {
        if (publishType === 'now') {
          publish();
        } else if (publishType === 'scheduled') {
          schedule();
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
              {experiments.ai && (
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
              loading={loading}
              type="submit"
            >
              {buttonLabel}
            </Button>
          </div>
        </form>
        <div className="PublishDocModal__DiffWrapper">
          {experiments.ai && (
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

PublishDocModal.id = MODAL_ID;
