import {Button, Modal, useMantineTheme} from '@mantine/core';
import {useState} from 'preact/hooks';
import {route} from 'preact-router';
import {cmsCreateDoc} from '../../utils/doc.js';
import {getDefaultFieldValue} from '../../utils/fields.js';
import {SlugInput} from '../SlugInput/SlugInput.js';
import './NewDocModal.css';
import {logAction} from '../../utils/actions.js';

interface NewDocModalProps {
  collection: string;
  opened?: boolean;
  onClose?: () => void;
}

function isSlugValid(slug: string): boolean {
  return Boolean(slug && slug.match(/^[a-z0-9]+(?:--?[a-z0-9]+)*$/));
}

/**
 * Normalizes a user-entered slug value into one appropriate for the CMS.
 *
 * In order to keep the slugs "flat" within firestore, nested paths use a double
 * dash separator. For example, a URL like "/about/foo" should have a slug like
 * "about--foo".
 *
 * Transformations include:
 *   Remove leading and trailing space
 *   Remove leading and trailing slash
 *   Lower case
 *   Replace '/' with '--', e.g. 'foo/bar' -> 'foo--bar'
 */
function normalizeSlug(slug: string): string {
  return slug
    .replace(/^[\s/]*/g, '')
    .replace(/[\s/]*$/g, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
    .replaceAll('/', '--');
}

export function NewDocModal(props: NewDocModalProps) {
  const collectionId = props.collection;
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [slugError, setSlugError] = useState('');
  const theme = useMantineTheme();

  const rootCollection = window.__ROOT_CTX.collections[collectionId];
  if (!rootCollection) {
    throw new Error(`collection not found: ${collectionId}`);
  }

  function onClose() {
    if (props.onClose) {
      props.onClose();
    }
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    setLoading(true);
    setSlugError('');

    const cleanSlug = normalizeSlug(slug);
    if (!isSlugValid(cleanSlug)) {
      setSlugError('Please enter a valid slug (e.g. "foo-bar-123").');
      setLoading(false);
      return;
    }

    const docId = `${collectionId}/${cleanSlug}`;
    try {
      const defaultValue = getDefaultFieldValue(rootCollection);
      await cmsCreateDoc(docId, {fields: defaultValue});
    } catch (err) {
      setSlugError(String(err));
      setLoading(false);
      return;
    }
    setLoading(false);
    route(`/cms/content/${props.collection}/${cleanSlug}?new=true`);
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
            loading={loading}
          >
            Submit
          </Button>
        </div>
      </form>
    </Modal>
  );
}
