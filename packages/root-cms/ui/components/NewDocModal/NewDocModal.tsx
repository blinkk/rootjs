import {Button, Modal, TextInput, useMantineTheme} from '@mantine/core';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {useRef, useState} from 'preact/hooks';
import {route} from 'preact-router';

import {Collection} from '../../../core/schema.js';
import {useFirebase} from '../../hooks/useFirebase.js';
import './NewDocModal.css';

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
    .toLowerCase()
    .replaceAll('/', '--');
}

/**
 * Returns the default field values for a collection. This is used to initialize
 * the doc when it is first created.
 */
function getDefaultFields(collection: Collection) {
  const fields: Record<string, unknown> = {};
  collection.fields.forEach((field) => {
    if (!field.id) {
      return;
    }
    if (field.default) {
      fields[field.id] = field.default;
    }
  });
  return fields;
}

export function NewDocModal(props: NewDocModalProps) {
  const collectionId = props.collection;
  const slugRef = useRef<HTMLInputElement>(null);
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [slugError, setSlugError] = useState('');
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

  const rootCollection = window.__ROOT_CTX.collections[collectionId];
  if (!rootCollection) {
    throw new Error(`collection not found: ${collectionId}`);
  }
  const domain = window.__ROOT_CTX.rootConfig.domain || 'https://example.com';

  let urlHelp = '';
  if (rootCollection?.url) {
    if (slug) {
      let urlPath = rootCollection.url.replace(/\[.*slug\]/, slug);
      // Rename `https://example.com/index` to `https://example.com/`.
      if (urlPath === '/index') {
        urlPath = '/';
      }
      urlHelp = `${domain}${urlPath}`;
    } else {
      urlHelp = `${domain}${rootCollection.url}`;
    }
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

    const slug = normalizeSlug(String(slugRef.current!.value));
    if (!isSlugValid(slug)) {
      setSlugError('Please enter a valid slug (e.g. "foo-bar-123").');
      setLoading(false);
      return;
    }

    const docId = `${collectionId}/${slug}`;
    const docRef = doc(dbCollection, slug);
    const snapshot = await getDoc(docRef);
    if (await snapshot.exists()) {
      setSlugError(`${docId} already exists`);
      setLoading(false);
      return;
    }
    await setDoc(docRef, {
      id: docId,
      slug: slug,
      collection: collectionId,
      sys: {
        createdAt: serverTimestamp(),
        createdBy: window.firebase.user.email,
        modifiedAt: serverTimestamp(),
        modifiedBy: window.firebase.user.email,
      },
      fields: getDefaultFields(rootCollection!),
    });
    setLoading(false);
    route(`/cms/content/${props.collection}/${slug}?new=true`);
  }

  return (
    <Modal
      className="NewDocModal"
      opened={props.opened || false}
      onClose={() => onClose()}
      title={`${props.collection}: New doc`}
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
        <div className="NewDocModal__slug">
          <TextInput
            name="slug"
            ref={slugRef}
            value={slug}
            onChange={(event) => setSlug(event.currentTarget.value)}
            placeholder="slug"
            autoComplete="off"
            size="xs"
            description={urlHelp}
            error={slugError}
          />
        </div>

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
