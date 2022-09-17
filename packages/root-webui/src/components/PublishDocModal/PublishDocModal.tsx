import {
  Button,
  Group,
  InputWrapper,
  Modal,
  Radio,
  RadioGroup,
} from '@mantine/core';
import {useState} from 'react';
import styles from './PublishDocModal.module.scss';

interface PublishDocModalProps {
  docId: string;
  opened?: boolean;
  onClose: () => void;
  onConfirm: (confirmProps: PublishDocModalConfirmProps) => void;
}

export interface PublishDocModalConfirmProps {
  docId: string;
  when: WhenType;
  publishAt?: string;
}

type WhenType = 'now' | 'later';

export function PublishDocModal(props: PublishDocModalProps) {
  const [when, setWhen] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [nextPage, setNextPage] = useState(false);
  const docId = props.docId;

  let buttonDisabled = true;
  if (when === 'now') {
    buttonDisabled = false;
  }
  if (when === 'later' && publishAt) {
    buttonDisabled = false;
  }

  return (
    <Modal
      opened={props.opened || false}
      title={`Publish ${props.docId}`}
      onClose={props.onClose}
      centered
    >
      {nextPage ? (
        <div className={styles.secondPage}>
          {when === 'now' && <div>Publish {docId} NOW?</div>}
          {when === 'later' && (
            <div>
              Publish {docId} at {publishAt}?
            </div>
          )}
          <Group className={styles.buttonGroup}>
            <Button
              variant="light"
              color="gray"
              onClick={() => setNextPage(false)}
            >
              Back
            </Button>
            <Button
              onClick={() =>
                props.onConfirm({
                  when: when as WhenType,
                  publishAt,
                  docId: props.docId,
                })
              }
            >
              Publish
            </Button>
          </Group>
        </div>
      ) : (
        <div className={styles.firstPage}>
          <RadioGroup
            size="sm"
            label="Publish"
            value={when}
            onChange={setWhen}
            required
          >
            <Radio value="now" label="Now" />
            <Radio value="later" label="Later" />
          </RadioGroup>
          {when === 'later' && (
            <InputWrapper
              className={styles.whenInputWrap}
              label="Go live at"
              description="Time zone: Pacific/Los_Angeles"
              required
            >
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
              />
            </InputWrapper>
          )}
          <Group className={styles.buttonGroup}>
            <Button variant="light" color="gray" onClick={props.onClose}>
              Cancel
            </Button>
            <Button disabled={buttonDisabled} onClick={() => setNextPage(true)}>
              Next
            </Button>
          </Group>
        </div>
      )}
    </Modal>
  );
}
