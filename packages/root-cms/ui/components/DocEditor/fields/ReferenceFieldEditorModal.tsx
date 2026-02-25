import './ReferenceFieldEditorModal.css';

import {Button, Group, Loader, Modal, Stack, Text} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconExternalLink} from '@tabler/icons-preact';
import {doc, serverTimestamp, updateDoc} from 'firebase/firestore';
import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {
  DraftDocContext,
  DraftDocContextProvider,
} from '../../../hooks/useDraftDoc.js';
import {useCollectionSchema} from '../../../hooks/useCollectionSchema.js';
import {useModalTheme} from '../../../hooks/useModalTheme.js';
import {
  getDocFromCacheOrFetch,
  setDocToCache,
} from '../../../utils/doc-cache.js';
import {notifyErrors} from '../../../utils/notifications.js';
import {cloneData} from '../../../utils/objects.js';
import {DocEditor} from '../DocEditor.js';
import {InMemoryDraftDocController} from '../../RichTextEditor/lexical/utils/InMemoryDraftDocController.js';

interface ReferenceFieldEditorModalProps {
  docId: string | null;
  opened: boolean;
  onClose: () => void;
}

/**
 * Modal for editing a referenced document and applying changes on save.
 */
export function ReferenceFieldEditorModal(
  props: ReferenceFieldEditorModalProps
) {
  const modalTheme = useModalTheme();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialDoc, setInitialDoc] = useState<any>(null);
  const collectionId = props.docId?.split('/')[0] || '';
  const collection = useCollectionSchema(collectionId);

  const controller = useMemo(() => {
    if (!initialDoc) {
      return null;
    }
    return new InMemoryDraftDocController(initialDoc, null);
  }, [initialDoc]);

  const draftContext: DraftDocContext | null = useMemo(() => {
    if (!controller) {
      return null;
    }
    return {
      loading: false,
      controller: controller as unknown as DraftDocContext['controller'],
    };
  }, [controller]);

  const objectField = useMemo<schema.ObjectField | null>(() => {
    if (!collection.schema) {
      return null;
    }
    return {
      type: 'object',
      id: 'fields',
      label: 'Fields',
      variant: 'inline',
      fields: collection.schema.fields,
    };
  }, [collection.schema]);

  useEffect(() => {
    if (!props.opened || !props.docId) {
      return;
    }
    setLoading(true);
    setInitialDoc(null);
    void (async () => {
      try {
        await notifyErrors(async () => {
          const loadedDoc = await getDocFromCacheOrFetch(props.docId!);
          setInitialDoc(cloneData(loadedDoc || null));
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [props.opened, props.docId]);

  async function onSave() {
    if (!props.docId || !controller) {
      return;
    }
    setSaving(true);
    await notifyErrors(async () => {
      const [collectionId, slug] = props.docId!.split('/');
      const projectId = window.__ROOT_CTX.rootConfig.projectId;
      const docRef = doc(
        window.firebase.db,
        'Projects',
        projectId,
        'Collections',
        collectionId,
        'Drafts',
        slug
      );
      const nextFields = cloneData(controller.getValue('fields') || {});
      await updateDoc(docRef, {
        fields: nextFields,
        'sys.modifiedAt': serverTimestamp(),
        'sys.modifiedBy': window.firebase.user.email,
      });
      const updatedDoc = {
        ...cloneData(initialDoc || {}),
        fields: nextFields,
      };
      setDocToCache(props.docId!, updatedDoc);
      showNotification({
        title: 'Saved changes',
        message: `Saved ${props.docId}`,
        color: 'green',
      });
      props.onClose();
    });
    setSaving(false);
  }

  if (!props.docId) {
    return null;
  }

  return (
    <Modal
      {...modalTheme}
      opened={props.opened}
      onClose={props.onClose}
      title="Reference Editor"
      size="90%"
      zIndex={190}
    >
      <Stack className="ReferenceFieldEditorModal" spacing="md">
        <Group position="right">
          <Button
            component="a"
            href={`/cms/content/${props.docId}`}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            variant="default"
            leftIcon={<IconExternalLink size={14} />}
          >
            Open in new tab
          </Button>
        </Group>
        {loading ? (
          <Group position="center" py="md">
            <Loader color="gray" size="sm" />
          </Group>
        ) : !objectField || !draftContext ? (
          <Text size="sm" color="dimmed">
            Unable to load reference fields.
          </Text>
        ) : (
          <DraftDocContextProvider value={draftContext}>
            <DocEditor.ObjectField field={objectField} deepKey="fields" />
          </DraftDocContextProvider>
        )}
        <Group position="right" className="ReferenceFieldEditorModal__footer">
          <Button
            variant="default"
            size="xs"
            onClick={props.onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="xs" onClick={onSave} loading={saving}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
