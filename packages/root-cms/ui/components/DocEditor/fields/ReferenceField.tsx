import './ReferenceField.css';

import {ActionIcon, Button, Image, Loader, Tooltip} from '@mantine/core';
import {IconTrash} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {getDocFromCacheOrFetch} from '../../../utils/doc-cache.js';
import {parseDocId} from '../../../utils/doc.js';
import {notifyErrors} from '../../../utils/notifications.js';
import {getNestedValue} from '../../../utils/objects.js';
import {useDocPickerModal} from '../../DocPickerModal/DocPickerModal.js';
import {FieldProps} from './FieldProps.js';

export interface ReferenceFieldValue {
  id: string;
  collection: string;
  slug: string;
}

export function ReferenceField(props: FieldProps) {
  const field = props.field as schema.ReferenceField;
  const [value, setValue] = useDraftDocValue<ReferenceFieldValue | null>(
    props.deepKey
  );
  const refId = value?.id || '';

  function onChange(newRefId: string) {
    if (newRefId) {
      setValue(parseDocId(newRefId));
    } else {
      setValue(null);
    }
  }

  const docPickerModal = useDocPickerModal();

  function openDocPicker() {
    const initialCollection = refId
      ? parseDocId(refId).collection
      : field.initialCollection;
    docPickerModal.open({
      collections: field.collections,
      initialCollection: initialCollection,
      onChange: (newRefId: string) => {
        onChange(newRefId);
        docPickerModal.close();
      },
    });
  }

  return (
    <div className="ReferenceField">
      {refId ? (
        <div className="ReferenceField__ref">
          <ReferenceField.Preview id={refId} />
          <div className="ReferenceField__remove">
            <Tooltip label="Remove">
              <ActionIcon
                className="ReferenceField__remove__icon"
                onClick={() => setValue(null)}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </div>
        </div>
      ) : (
        <div className="ReferenceField__none">None selected</div>
      )}
      <Button color="dark" size="xs" onClick={() => openDocPicker()}>
        {field.buttonLabel || 'Select'}
      </Button>
    </div>
  );
}

interface ReferencePreviewProps {
  id: string;
}

ReferenceField.Preview = (props: ReferencePreviewProps) => {
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<any>(null);

  async function fetchDocData() {
    setLoading(true);
    await notifyErrors(async () => {
      const docData = await getDocFromCacheOrFetch(props.id);
      setPreviewDoc(docData);
    });
    setLoading(false);
  }

  useEffect(() => {
    fetchDocData();
  }, [props.id]);

  return (
    <div className="ReferenceField__Preview">
      {loading ? (
        <div className="ReferenceField__Preview__loading">
          <Loader color="gray" size="sm" />
        </div>
      ) : previewDoc ? (
        <ReferenceField.DocCard doc={previewDoc} />
      ) : (
        <div className="ReferenceField__Preview__notfound">
          Doc not found: <b>{props.id}</b> (was it deleted?). Select a new doc
          or remove using the trash icon to the right.
        </div>
      )}
    </div>
  );
};

ReferenceField.DocCard = (props: {doc: any}) => {
  const doc = props.doc;
  // NOTE(stevenle): older db versions stored the doc id as doc.sys.id.
  const docId = doc.id || doc.sys?.id || '';
  if (!docId) {
    return (
      <div className="ReferenceField__DocCard ReferenceField__DocCard--error">
        {JSON.stringify(doc)}
      </div>
    );
  }
  const collection = parseDocId(docId).collection;
  const fields = doc.fields || {};
  const rootCollection = window.__ROOT_CTX.collections[collection];
  if (!rootCollection) {
    throw new Error(`could not find collection: ${collection}`);
  }
  const previewTitle = getNestedValue(
    fields,
    rootCollection.preview?.title || 'meta.title'
  );
  const previewImage =
    getNestedValue(fields, rootCollection.preview?.image || 'meta.image') ||
    rootCollection.preview?.defaultImage;

  return (
    <a
      className="ReferenceField__DocCard"
      href={`/cms/content/${docId}`}
      target="_blank"
    >
      <div className="ReferenceField__DocCard__image">
        <Image
          src={previewImage?.src}
          width={80}
          height={60}
          withPlaceholder={!previewImage?.src}
        />
      </div>
      <div className="ReferenceField__DocCard__content">
        <div className="ReferenceField__DocCard__content__header">
          <div className="ReferenceField__DocCard__content__header__docId">
            {docId}
          </div>
        </div>
        <div className="ReferenceField__DocCard__content__title">
          {previewTitle || '[UNTITLED]'}
        </div>
      </div>
    </a>
  );
};
