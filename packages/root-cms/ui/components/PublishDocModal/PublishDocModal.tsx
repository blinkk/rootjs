/** @jsxImportSource preact */
import {Accordion, Button, Loader} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {useState, useRef, useEffect} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {joinClassNames} from '../../utils/classes.js';
import {cmsPublishDoc, cmsScheduleDoc, cmsReadDocVersion, getDraftDocs, cmsPublishDocs} from '../../utils/doc.js';
import {getLocalISOString} from '../../utils/time.js';
import {DocDiffViewer} from '../DocDiffViewer/DocDiffViewer.js';
import {Text} from '../Text/Text.js';
import {useCollectionSchema} from '../../hooks/useCollectionSchema.js';

import './PublishDocModal.css';

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
  const dateTimeRef = useRef<HTMLInputElement>(null);
  const modals = useModals();
  const modalTheme = useModalTheme();
  const [draftRefs, setDraftRefs] = useState<string[]>([]);
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);
  const {schema: collectionSchema, loading: schemaLoading} = useCollectionSchema(props.docId.split('/')[0]);

  const buttonLabel = publishType === 'scheduled' ? 'Schedule' : 'Publish';

  // Helper: Recursively find all reference fields in the doc fields
  function findReferenceDocIds(fields: any, schemaFields?: any[]): string[] {
    if (!fields || typeof fields !== 'object') return [];
    let refs: string[] = [];
    if (schemaFields) {
      for (const field of schemaFields) {
        if (field.type === 'reference') {
          const ref = fields[field.id];
          if (ref && ref.id) refs.push(ref.id);
        } else if (field.type === 'object' && fields[field.id]) {
          refs = refs.concat(findReferenceDocIds(fields[field.id], field.fields));
        } else if (field.type === 'array' && Array.isArray(fields[field.id]?._array)) {
          const arr = fields[field.id];
          for (const key of arr._array) {
            refs = refs.concat(findReferenceDocIds(arr[key], field.of.fields));
          }
        } else if (field.type === 'oneof' && fields[field.id]) {
          const oneOfType = fields[field.id]._type;
          const oneOfSchema = field.types.find((t: any) => t.name === oneOfType);
          if (oneOfSchema) {
            refs = refs.concat(findReferenceDocIds(fields[field.id], oneOfSchema.fields));
          }
        }
      }
    } else {
      for (const key in fields) {
        if (fields[key] && typeof fields[key] === 'object') {
          if (fields[key].id && typeof fields[key].id === 'string') {
            refs.push(fields[key].id);
          } else {
            refs = refs.concat(findReferenceDocIds(fields[key]));
          }
        }
      }
    }
    return refs;
  }

  // Load draft doc and find referenced docs that are still in draft
  useEffect(() => {
    let mounted = true;
    async function loadRefs() {
      setRefsLoading(true);
      if (!collectionSchema) {
        setDraftRefs([]);
        setSelectedRefs([]);
        setRefsLoading(false);
        return;
      }
      const draftDoc = await cmsReadDocVersion(props.docId, 'draft');
      if (!draftDoc) {
        setDraftRefs([]);
        setSelectedRefs([]);
        setRefsLoading(false);
        return;
      }
      const refs = findReferenceDocIds(draftDoc.fields, collectionSchema.fields);
      const uniqueRefs = Array.from(new Set(refs));
      if (uniqueRefs.length === 0) {
        setDraftRefs([]);
        setSelectedRefs([]);
        setRefsLoading(false);
        return;
      }
      const draftStates = await Promise.all(
        uniqueRefs.map(async (refId: string) => {
          const published = await cmsReadDocVersion(refId, 'published');
          return published ? null : refId;
        })
      );
      const draftOnlyRefs = draftStates.filter(Boolean) as string[];
      setDraftRefs(draftOnlyRefs);
      setSelectedRefs(draftOnlyRefs); // default: select all
      setRefsLoading(false);
    }
    loadRefs();
    return () => {
      mounted = false;
    };
  }, [props.docId, collectionSchema]);

  async function publish() {
    try {
      setLoading(true);
      const docIds = [props.docId, ...selectedRefs.filter((id: string) => id !== props.docId)];
      await cmsPublishDocs(docIds);
      setLoading(false);
      showNotification({
        title: 'Published!',
        message: `Succesfully published ${docIds.join(', ')}.`,
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
      await cmsScheduleDoc(props.docId, millis);
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

  function onSubmit() {
    modals.openConfirmModal({
      ...modalTheme,
      title: `${buttonLabel} ${props.docId}`,
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to publish <code>{props.docId}</code>? The doc
          will go live {publishType === 'now' ? 'now' : `at ${scheduledDate}`}.
        </Text>
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

  return (
    <div className="PublishDocModal">
      <div className="PublishDocModal__content">
        {/* Draft references warning and checkboxes */}
        {refsLoading || schemaLoading ? (
          <Loader />
        ) : draftRefs.length > 0 && (
          <div className="PublishDocModal__draftRefsWarning" style={{marginBottom: 16}}>
            <div style={{color: '#d97706', fontWeight: 600, marginBottom: 8}}>Draft documents</div>
            <div style={{marginBottom: 8}}>
              The following referenced documents are still in draft. Select which to publish with this document:
            </div>
            <div style={{marginBottom: 8}}>
              {draftRefs.map((refId: string) => (
                <label key={refId} style={{display: 'block', fontWeight: 400}}>
                  <input
                    type="checkbox"
                    checked={selectedRefs.includes(refId)}
                    onChange={(e: Event) => {
                      const target = e.currentTarget as HTMLInputElement;
                      if (target.checked) {
                        setSelectedRefs([...selectedRefs, refId]);
                      } else {
                        setSelectedRefs(selectedRefs.filter((id: string) => id !== refId));
                      }
                    }}
                  />{' '}
                  {refId}
                </label>
              ))}
            </div>
          </div>
        )}

        <form
          className="PublishDocModal__form"
          onSubmit={(e: Event) => {
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

        <ShowChanges docId={props.docId} />
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
      <Accordion iconPosition="right" onChange={() => toggle()}>
        <Accordion.Item label="Show changes">
          {toggled ? (
            <DocDiffViewer
              left={{docId, versionId: 'published'}}
              right={{docId, versionId: 'draft'}}
              showExpandButton={true}
            />
          ) : (
            <Loader />
          )}
        </Accordion.Item>
      </Accordion>
    </div>
  );
}

PublishDocModal.id = MODAL_ID;
