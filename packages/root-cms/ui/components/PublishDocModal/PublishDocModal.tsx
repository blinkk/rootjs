import {Button, Modal, useMantineTheme} from '@mantine/core';
import {doc, getDoc, runTransaction, serverTimestamp} from 'firebase/firestore';
import {useState, useRef} from 'preact/hooks';

import {useFirebase} from '../../hooks/useFirebase.js';
import './PublishDocModal.css';

interface PublishDocModalProps {
  docId: string;
  opened?: boolean;
  onClose?: () => void;
}

type PublishType = 'now' | 'scheduled' | '';

export function PublishDocModal(props: PublishDocModalProps) {
  const [collectionId, slug] = props.docId.split('/');
  const [publishType, setPublishType] = useState<PublishType>('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [loading, setLoading] = useState(false);
  const firebase = useFirebase();
  const theme = useMantineTheme();
  const dateTimeRef = useRef<HTMLInputElement>(null);

  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const draftDocRef = doc(
    firebase.db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const publishedDocRef = doc(
    firebase.db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Published',
    slug
  );

  // const rootCollection = window.__ROOT_CTX.collections[collectionId];
  // if (!rootCollection) {
  //   throw new Error(`collection not found: ${collectionId}`);
  // }

  function onClose() {
    if (props.onClose) {
      props.onClose();
    }
  }

  function onPublishClicked() {
    if (publishType === 'now') {
      publish();
    } else if (publishType === 'scheduled') {
      schedule();
    }
  }

  async function publish() {
    try {
      setLoading(true);
      await runTransaction(firebase.db, async (transaction) => {
        const draftDoc = await getDoc(draftDocRef);
        if (!draftDoc.exists()) {
          throw new Error(`${draftDocRef.id} does not exist`);
        }

        const data = {...draftDoc.data()};
        const sys = data.sys ?? {};
        sys.modifiedAt = serverTimestamp();
        sys.modifiedBy = window.firebase.user.email;
        sys.publishedAt = serverTimestamp();
        sys.publishedBy = window.firebase.user.email;
        // Update the "firstPublishedAt" values only if they don't already exist.
        sys.firstPublishedAt ??= serverTimestamp();
        sys.firstPublishedBy ??= window.firebase.user.email;

        // Update the "sys" metadata in the draft doc.
        transaction.update(draftDocRef, {sys});
        // Copy the "draft" data to "published" data.
        transaction.set(publishedDocRef, {...data, sys});
      });
      setLoading(false);
      console.log(`saved ${publishedDocRef.id}`);
    } catch (err) {
      console.error(`failed to publish ${publishedDocRef.id}`, err);
    }
  }

  async function schedule() {
    console.log('TODO(stevenle): implement');
  }

  let disabled = true;
  if (publishType === 'now') {
    disabled = false;
  } else if (publishType === 'scheduled' && scheduledDate) {
    disabled = false;
  }

  return (
    <Modal
      className="PublishDocModal"
      opened={props.opened || false}
      onClose={() => onClose()}
      title={`Publish ${props.docId}`}
      size="lg"
      overlayColor={
        theme.colorScheme === 'dark'
          ? theme.colors.dark[9]
          : theme.colors.gray[2]
      }
      overlayOpacity={0.55}
      overlayBlur={3}
    >
      <div className="PublishDocModal__content">
        <form className="PublishDocModal__form">
          <div className="PublishDocModal__form__publishOptions">
            {/* <div className="PublishDocModal__form__publishOptions__label">
              Publish Date
            </div> */}
            <div className="PublishDocModal__form__publishOptions__options">
              <label className="PublishDocModal__form__publishOptions__option">
                <div className="PublishDocModal__form__publishOptions__option__input">
                  <input
                    type="radio"
                    name="publish-option"
                    value="now"
                    onChange={() => setPublishType('now')}
                  />{' '}
                  Now
                </div>
                <div className="PublishDocModal__form__publishOptions__option__help">
                  Content will go live immediately.
                </div>
              </label>
              <label className="PublishDocModal__form__publishOptions__option">
                <div className="PublishDocModal__form__publishOptions__option__input">
                  <input
                    type="radio"
                    name="publish-option"
                    value="scheduled"
                    onChange={() => setPublishType('scheduled')}
                  />{' '}
                  Scheduled
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
                    onChange={(e: Event) => setScheduledDate(e.target.value)}
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
              onClick={() => onClose()}
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
              onClick={onPublishClicked}
            >
              Publish
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
