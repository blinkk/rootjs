import {useId, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {renderAutoSlug} from '../../../../../shared/auto-slug.js';
import {getSlugError, normalizeSlug} from '../../../../../shared/slug.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {cmsCreateDoc} from '../../../documents/doc.js';
import {getDefaultFieldValue} from '../../../documents/fields.js';
import {useCollectionSchema} from '../../useCollectionSchema.js';
import {SlugInput} from '../SlugInput/SlugInput.js';

interface NewDocModalProps {
  collection: string;
  opened?: boolean;
  onClose?: () => void;
  /** If true, don't navigate to doc editor after creation. */
  skipNavigation?: boolean;
}

export function NewDocModal(props: NewDocModalProps) {
  const {route} = useLocation();
  const formId = useId();
  const collectionId = props.collection;
  const rootCollection = window.__ROOT_CTX.collections[collectionId];
  if (!rootCollection) {
    throw new Error(`collection not found: ${collectionId}`);
  }
  const [initialSlug] = useState(() =>
    rootCollection.autoSlug ? renderAutoSlug(rootCollection.autoSlug) : ''
  );
  const [slug, setSlug] = useState(initialSlug);
  const [rpcLoading, setRpcLoading] = useState(false);
  const [slugError, setSlugError] = useState(() => validateSlug(initialSlug));
  const [error, setError] = useState('');
  const collection = useCollectionSchema(collectionId);

  function validateSlug(value: string) {
    const cleanSlug = normalizeSlug(value);
    return cleanSlug ? getSlugError(cleanSlug, rootCollection.slugRegex) : '';
  }

  function onClose() {
    if (props.onClose) {
      props.onClose();
    }
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    setRpcLoading(true);
    setSlugError('');

    const slugValidationError = validateSlug(slug);
    if (slugValidationError) {
      // SlugInput already displays this error, just return early.
      setRpcLoading(false);
      return;
    }

    const cleanSlug = normalizeSlug(slug);
    const docId = `${collectionId}/${cleanSlug}`;
    try {
      // Save the doc using the default value defined in the collection's
      // schema.
      let defaultValue = {};
      if (!collection.loading && collection.schema) {
        defaultValue = await getDefaultFieldValue(collection.schema);
      }
      await cmsCreateDoc(docId, {fields: defaultValue});
    } catch (err) {
      setError(String(err));
      setRpcLoading(false);
      return;
    }
    setRpcLoading(false);
    if (props.skipNavigation) {
      // Just close the modal without navigating
      onClose();
    } else {
      route(`/cms/content/${props.collection}/${cleanSlug}`);
    }
  }

  return (
    <Dialog
      className="NewDocModal"
      open={props.opened || false}
      onClose={() => onClose()}
      title="New"
      size="500px"
      footer={
        <>
          <Button onClick={() => onClose()} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            loading={collection.loading || rpcLoading}
            disabled={!!slugError || !!error}
          >
            Submit
          </Button>
        </>
      }
    >
      {props.opened && (
        <>
          <div className="NewDocModal__body text-sm font-medium leading-normal">
            Enter a slug for the new doc. The slug is the ID of the page and is
            what's used in the URL. Use only lowercase letters, numbers, and
            dashes.
          </div>

          <form id={formId} onSubmit={(e) => onSubmit(e)}>
            <SlugInput
              className="NewDocModal__slug mt-4"
              collectionId={collectionId}
              initialSlug={initialSlug}
              onChange={(newValue: {collectionId: string; slug: string}) => {
                setSlug(newValue.slug);
                setSlugError(validateSlug(newValue.slug));
                setError('');
              }}
            />

            {error && (
              <div
                className="NewDocModal__slugError mt-3 rounded-sm border border-danger-line bg-danger-soft px-3 py-2 text-sm font-medium leading-normal text-danger"
                role="alert"
              >
                {error}
              </div>
            )}
          </form>
        </>
      )}
    </Dialog>
  );
}
