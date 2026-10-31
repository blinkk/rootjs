import {useState, useEffect} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {getSlugError, normalizeSlug} from '../../../../../shared/slug.js';
import {Text} from '../../../../components/Text/Text.js';
import {Button} from '../../../../primitives/Button/Button.js';
import type {ContextModalProps} from '../../../../primitives/modals/ModalsProvider.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cmsCopyDoc, cmsCreateDoc} from '../../../documents/doc.js';
import {batchUpdateTags, loadTranslations} from '../../../translations/l10n.js';
import {SlugInput} from '../SlugInput/SlugInput.js';
import {COPY_DOC_MODAL_ID} from './useCopyDocModal.js';

export interface CopyDocModalProps {
  [key: string]: unknown;
  fromDocId: string;
  fields?: Record<string, any>;
  fromLabel?: string;
  onSuccess?: (newDocId: string) => void;
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
      const docUrl = `/cms/content/${toCollectionId}/${cleanSlug}`;
      showNotification({
        title: 'Copied!',
        message: (
          <div>
            <div>{`Successfully copied ${sourceLabel} to ${toDocId}.`}</div>
            <Button
              className="CopyDocModal__notificationButton mt-2"
              href={docUrl}
              size="xs"
            >
              Open doc
            </Button>
          </div>
        ),
        autoClose: 10000,
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
          <Text
            className="CopyDocModal__from__label mb-2"
            size="body"
            weight="bold"
          >
            From:
          </Text>
          <Text className="CopyDocModal__from__value break-all" size="body-sm">
            <code>{sourceLabel}</code>
          </Text>
        </div>

        <div className="CopyDocModal__to mt-4">
          <Text
            className="CopyDocModal__to__label mb-2"
            size="body"
            weight="bold"
          >
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

        {error && (
          <div
            className="CopyDocModal__error mt-3 rounded-sm border border-danger-line bg-danger-soft px-3 py-2 text-sm font-medium leading-normal text-danger"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="CopyDocModal__buttons mt-6 flex justify-end gap-3">
          <Button onClick={() => context.closeModal(id)} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
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

CopyDocModal.id = COPY_DOC_MODAL_ID;
