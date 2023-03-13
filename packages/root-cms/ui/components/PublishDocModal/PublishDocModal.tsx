import {Button, Modal, useMantineTheme} from '@mantine/core';
import {useFirebase} from '../../hooks/useFirebase.js';
import {collection} from 'firebase/firestore';
import './PublishDocModal.css';

interface PublishDocModalProps {
  docId: string;
  opened?: boolean;
  onClose?: () => void;
}

export function PublishDocModal(props: PublishDocModalProps) {
  const [collectionId, slug] = props.docId.split('/');
  const firebase = useFirebase();
  const theme = useMantineTheme();

  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const dbCollection = collection(
    firebase.db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts'
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
                  <input type="radio" name="publish-option" value="now" /> Now
                </div>
                <div className="PublishDocModal__form__publishOptions__option__help">
                  Content will go live immediately.
                </div>
              </label>
              <label className="PublishDocModal__form__publishOptions__option">
                <div className="PublishDocModal__form__publishOptions__option__input">
                  <input type="radio" name="publish-option" value="scheduled" />{' '}
                  Scheduled
                </div>
                <div className="PublishDocModal__form__publishOptions__option__help">
                  Content will go live at the date and time specified below.
                </div>
                <div className="PublishDocModal__form__publishOptions__option__input2">
                  <input type="datetime-local" />
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
              type="submit"
              size="xs"
              color="dark"
              disabled
              // loading={loading}
            >
              Publish
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
