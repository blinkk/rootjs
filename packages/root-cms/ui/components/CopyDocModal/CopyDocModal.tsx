import {Button} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {useState} from 'preact/hooks';
import {route} from 'preact-router';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {cmsCopyDoc} from '../../utils/doc.js';
import {isSlugValid, normalizeSlug} from '../../utils/slug.js';
import {SlugInput} from '../SlugInput/SlugInput.js';
import {Text} from '../Text/Text.js';
import './CopyDocModal.css';

const MODAL_ID = 'CopyDocModal';

export interface CopyDocModalProps {
  [key: string]: unknown;
  fromDocId: string;
}

export function useCopyDocModal(props: CopyDocModalProps) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: () => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
      });
    },
  };
}

export function CopyDocModal(modalProps: ContextModalProps<CopyDocModalProps>) {
  const {innerProps: props, context, id} = modalProps;
  const [toCollectionId, setToCollectionId] = useState('');
  const [toSlug, setToSlug] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fromDocId = props.fromDocId;
  const fromCollectionId = fromDocId.split('/')[0];

  async function onSubmit(e: Event) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!fromCollectionId) {
      setError('Please select a collection.');
      setLoading(false);
      return;
    }
    const cleanSlug = normalizeSlug(toSlug);
    if (!isSlugValid(cleanSlug)) {
      setError('Please enter a valid slug (e.g. "foo-bar-123").');
      setLoading(false);
      return;
    }

    const toDocId = `${toCollectionId}/${cleanSlug}`;
    try {
      await cmsCopyDoc(fromDocId, toDocId);
      context.closeModal(id);
      showNotification({
        title: 'Copied!',
        message: `Succesfully copied ${fromDocId} to ${toDocId}.`,
        autoClose: 5000,
      });
    } catch (err) {
      setError(String(err));
      setLoading(false);
      return;
    }
    setLoading(false);
    route(`/cms/content/${toCollectionId}/${cleanSlug}`);
  }

  return (
    <div className="CopyDocModal">
      <form onSubmit={(e) => onSubmit(e)}>
        <div className="CopyDocModal__from">
          <Text className="CopyDocModal__from__label" size="body" weight="bold">
            From:
          </Text>
          <Text className="CopyDocModal__from__value" size="body-sm">
            <code>{props.fromDocId}</code>
          </Text>
        </div>

        <div className="CopyDocModal__to">
          <Text className="CopyDocModal__to__label" size="body" weight="bold">
            To:
          </Text>
          <SlugInput
            className="CopyDocModal__slug"
            collectionId={fromCollectionId}
            onChange={(newValue: {collectionId: string; slug: string}) => {
              setToCollectionId(newValue.collectionId);
              setToSlug(newValue.slug);
            }}
          />
        </div>

        {error && <div className="CopyDocModal__error">{error}</div>}

        <div className="CopyDocModal__buttons">
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
            type="submit"
            size="xs"
            color="dark"
            loading={loading}
          >
            Submit
          </Button>
        </div>
      </form>
    </div>
  );
}

CopyDocModal.id = MODAL_ID;
