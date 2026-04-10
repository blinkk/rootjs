import {Button} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {useState, useEffect} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {getSlugError, normalizeSlug} from '../../../shared/slug.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {cmsDeleteDoc, cmsCopyDoc} from '../../utils/doc.js';
import {
  batchRemoveTags,
  batchUpdateTags,
  loadTranslations,
} from '../../utils/l10n.js';
import {SlugInput} from '../SlugInput/SlugInput.js';
import {Text} from '../Text/Text.js';
import './MoveDocModal.css';

const MODAL_ID = 'MoveDocModal';

export interface MoveDocModalProps {
  [key: string]: unknown;
  fromDocId: string;
  fromLabel?: string;
  onSuccess?: (newDocId: string) => void;
}

export function useMoveDocModal(props: MoveDocModalProps) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (overrideProps?: Partial<MoveDocModalProps>) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: {...props, ...overrideProps},
      });
    },
  };
}

export function MoveDocModal(modalProps: ContextModalProps<MoveDocModalProps>) {
  const {innerProps: props, context, id} = modalProps;
  const {route} = useLocation();
  const [toCollectionId, setToCollectionId] = useState('');
  const [toSlug, setToSlug] = useState('');
  const [slugError, setSlugError] = useState('');
  const [error, setError] = useState('');
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [translationsMap, setTranslationsMap] = useState<
    Record<string, unknown>
  >({});

  const fromDocId = props.fromDocId;
  const fromCollectionId = fromDocId.split('/')[0];
  const sourceLabel = props.fromLabel || fromDocId;

  // Load translations tagged with the source doc ID.
  useEffect(() => {
    loadTranslations({tags: [fromDocId]}).then(setTranslationsMap);
  }, [fromDocId]);

  function validateSlug(slug: string, collectionId: string) {
    const cleanSlug = normalizeSlug(slug);
    const slugRegex = window.__ROOT_CTX.collections[collectionId]?.slugRegex;
    return cleanSlug ? getSlugError(cleanSlug, slugRegex) : '';
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!fromCollectionId) {
      setError('Please select a collection.');
      setLoading(false);
      return;
    }
    const slugValidationError = validateSlug(toSlug, toCollectionId);
    if (slugValidationError) {
      // SlugInput already displays this error, just return early.
      setLoading(false);
      return;
    }

    const cleanSlug = normalizeSlug(toSlug);
    const toDocId = `${toCollectionId}/${cleanSlug}`;
    try {
      // 1. Copy the document to the new location.
      await cmsCopyDoc(fromDocId, toDocId, {overwrite: confirmOverwrite});

      // 2. Copy translation tags: add the new doc ID tag to all strings
      // tagged with the old doc ID.
      const translationHashes = Object.keys(translationsMap);
      if (translationHashes.length > 0) {
        const updates = translationHashes.map((hash) => ({
          hash,
          tags: [toDocId],
        }));
        await batchUpdateTags(updates, {mode: 'union'});

        // 3. Remove the old doc ID tag from translations.
        await batchRemoveTags(translationHashes, [fromDocId]);
      }

      // 4. Delete the old document.
      await cmsDeleteDoc(fromDocId);

      context.closeModal(id);
      showNotification({
        title: 'Moved!',
        message: `Successfully moved ${sourceLabel} to ${toDocId}.`,
        autoClose: 5000,
      });
      if (props.onSuccess) {
        props.onSuccess(toDocId);
      }
    } catch (err) {
      const errMsg = String(err);
      setError(errMsg);

      // If doc exists on the given path, allow the option to overwrite the
      // existing path.
      if (errMsg.includes('already exists')) {
        setConfirmOverwrite(true);
      }

      setLoading(false);
      return;
    }
    setLoading(false);
    route(`/cms/content/${toCollectionId}/${cleanSlug}`);
  }

  return (
    <div className="MoveDocModal">
      <form onSubmit={(e) => onSubmit(e)}>
        <div className="MoveDocModal__from">
          <Text className="MoveDocModal__from__label" size="body" weight="bold">
            From:
          </Text>
          <Text className="MoveDocModal__from__value" size="body-sm">
            <code>{sourceLabel}</code>
          </Text>
        </div>

        <div className="MoveDocModal__to">
          <Text className="MoveDocModal__to__label" size="body" weight="bold">
            To:
          </Text>
          <SlugInput
            className="MoveDocModal__slug"
            collectionId={fromCollectionId}
            onChange={(newValue: {collectionId: string; slug: string}) => {
              setToCollectionId(newValue.collectionId);
              setToSlug(newValue.slug);
              setSlugError(validateSlug(newValue.slug, newValue.collectionId));
              setError('');
              setConfirmOverwrite(false);
            }}
          />
        </div>

        {error && <div className="MoveDocModal__error">{error}</div>}

        <div className="MoveDocModal__buttons">
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
            disabled={!!error || !!slugError}
          >
            {confirmOverwrite ? 'Overwrite?' : 'Move'}
          </Button>
        </div>
      </form>
    </div>
  );
}

MoveDocModal.id = MODAL_ID;
