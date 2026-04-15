import {Button} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {useState, useEffect} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {getSlugError, normalizeSlug} from '../../../shared/slug.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {cmsCopyDoc, cmsCreateDoc} from '../../utils/doc.js';
import {batchUpdateTags, loadTranslations} from '../../utils/l10n.js';
import {SlugInput} from '../SlugInput/SlugInput.js';
import {Text} from '../Text/Text.js';
import './CopyDocModal.css';

const MODAL_ID = 'CopyDocModal';

export interface CopyDocModalProps {
  [key: string]: unknown;
  fromDocId: string;
  fields?: Record<string, any>;
  fromLabel?: string;
  onSuccess?: (newDocId: string) => void;
}

export function useCopyDocModal(props: CopyDocModalProps) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (overrideProps?: Partial<CopyDocModalProps>) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: {...props, ...overrideProps},
      });
    },
  };
}

export function CopyDocModal(modalProps: ContextModalProps<CopyDocModalProps>) {
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
      if (props.fields) {
        await cmsCreateDoc(toDocId, {
          fields: props.fields,
          overwrite: confirmOverwrite,
        });
      } else {
        await cmsCopyDoc(fromDocId, toDocId, {overwrite: confirmOverwrite});
      }

      // Auto-copy translations by adding the new doc ID tag to all strings
      // tagged with the old doc ID.
      const translationHashes = Object.keys(translationsMap);
      if (translationHashes.length > 0) {
        const updates = translationHashes.map((hash) => ({
          hash,
          tags: [toDocId],
        }));
        await batchUpdateTags(updates, {mode: 'union'});
      }

      context.closeModal(id);
      showNotification({
        title: 'Copied!',
        message: `Succesfully copied ${sourceLabel} to ${toDocId}.`,
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
    <div className="CopyDocModal">
      <form onSubmit={(e) => onSubmit(e)}>
        <div className="CopyDocModal__from">
          <Text className="CopyDocModal__from__label" size="body" weight="bold">
            From:
          </Text>
          <Text className="CopyDocModal__from__value" size="body-sm">
            <code>{sourceLabel}</code>
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
              setSlugError(validateSlug(newValue.slug, newValue.collectionId));
              setError('');
              setConfirmOverwrite(false);
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
            disabled={!!slugError || (!!error && !confirmOverwrite)}
          >
            {confirmOverwrite ? 'Overwrite?' : 'Submit'}
          </Button>
        </div>
      </form>
    </div>
  );
}

CopyDocModal.id = MODAL_ID;
