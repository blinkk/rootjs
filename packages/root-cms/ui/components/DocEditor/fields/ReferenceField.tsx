import {ActionIcon, Button, Image, Loader, Tooltip} from '@mantine/core';
import {IconTrash} from '@tabler/icons-preact';
import {getDoc} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {getDraftDocRef} from '../../../utils/doc.js';
import {getNestedValue} from '../../../utils/objects.js';
import {useDocPickerModal} from '../../DocPickerModal/DocPickerModal.js';
import {FieldProps} from './FieldProps.js';
import './ReferenceField.css';

export function ReferenceField(props: FieldProps) {
  const field = props.field as schema.ReferenceField;
  const [refId, setRefId] = useState('');

  function onChange(newRefId: string) {
    if (newRefId) {
      const [collection, slug] = newRefId.split('/');
      props.draft.updateKey(props.deepKey, {id: newRefId, collection, slug});
    } else {
      props.draft.removeKey(props.deepKey);
    }
    setRefId(newRefId);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue?: {id: string}) => {
        setRefId(newValue?.id || '');
      }
    );
    return unsubscribe;
  }, []);

  const docPickerModal = useDocPickerModal();

  function openDocPicker() {
    const initialCollection = refId
      ? refId.split('/')[0]
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

  function removeDoc() {
    onChange('');
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
                onClick={() => removeDoc()}
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

const REF_PREVIEW_CACHE: Record<string, any> = {};

interface ReferencePreviewProps {
  id: string;
}

ReferenceField.Preview = (props: ReferencePreviewProps) => {
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<any>(null);

  async function fetchDocData() {
    setLoading(true);
    const docRef = getDraftDocRef(props.id);
    const doc = await getDoc(docRef);
    const docData = doc.data();
    REF_PREVIEW_CACHE[props.id] = docData;
    setPreviewDoc(docData);
    setLoading(false);
  }

  useEffect(() => {
    const cachedValue = REF_PREVIEW_CACHE[props.id];
    if (cachedValue) {
      setPreviewDoc(cachedValue);
      setLoading(false);
      return;
    }
    fetchDocData();
  }, [props.id]);

  return (
    <div className="ReferenceField__Preview">
      {loading ? (
        <div className="ReferenceField__Preview__loading">
          <Loader color="gray" size="sm" />
        </div>
      ) : (
        <ReferenceField.DocCard doc={previewDoc} />
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
  const collection = docId.split('/')[0];
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
    <div className="ReferenceField__DocCard">
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
    </div>
  );
};
