import {Button, Modal, useMantineTheme} from '@mantine/core';
import {useState} from 'preact/hooks';
import {route} from 'preact-router';
import {isSlugValid, normalizeSlug} from '../../../shared/slug.js';
import {useCollectionSchema} from '../../hooks/useCollectionSchema.js';
import {cmsCreateDoc} from '../../utils/doc.js';
import {getDefaultFieldValue} from '../../utils/fields.js';
import {SlugInput} from '../SlugInput/SlugInput.js';
import './NewDocModal.css';

interface NewDocModalProps {
  collection: string;
  opened?: boolean;
  onClose?: () => void;
  /** If true, don't navigate to doc editor after creation. */
  skipNavigation?: boolean;
}

export function NewDocModal(props: NewDocModalProps) {
  const [slug, setSlug] = useState('');
  const [rpcLoading, setRpcLoading] = useState(false);
  const [slugError, setSlugError] = useState('');
  const theme = useMantineTheme();
  const collectionId = props.collection;
  const rootCollection = window.__ROOT_CTX.collections[collectionId];
  if (!rootCollection) {
    throw new Error(`collection not found: ${collectionId}`);
  }
  const collection = useCollectionSchema(collectionId);

  function onClose() {
    if (props.onClose) {
      props.onClose();
    }
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    setRpcLoading(true);
    setSlugError('');

    const cleanSlug = normalizeSlug(slug);
    const slugRegex = rootCollection.slugRegex;
    if (!isSlugValid(cleanSlug, slugRegex)) {
      setSlugError('Please enter a valid slug (e.g. "foo-bar-123").');
      setRpcLoading(false);
      return;
    }

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
      setSlugError(String(err));
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
    <Modal
      className="NewDocModal"
      opened={props.opened || false}
      onClose={() => onClose()}
      title="New"
      size="500px"
      overlayColor={
        theme.colorScheme === 'dark'
          ? theme.colors.dark[9]
          : theme.colors.gray[2]
      }
    >
      <div className="NewDocModal__body">
        Enter a slug for the new doc. The slug is the ID of the page and is
        what's used in the URL. Use only lowercase letters, numbers, and dashes.
      </div>

      <form onSubmit={(e) => onSubmit(e)}>
        <SlugInput
          className="NewDocModal__slug"
          collectionId={collectionId}
          onChange={(newValue: {collectionId: string; slug: string}) => {
            setSlug(newValue.slug);
          }}
        />

        {slugError && <div className="NewDocModal__slugError">{slugError}</div>}

        <div className="NewDocModal__buttons">
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
            loading={collection.loading || rpcLoading}
          >
            Submit
          </Button>
        </div>
      </form>
    </Modal>
  );
}
