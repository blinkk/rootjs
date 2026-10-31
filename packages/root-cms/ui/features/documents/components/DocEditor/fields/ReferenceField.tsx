import {IconPencil, IconTrash} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../../../core/schema.js';
import {FilePreview} from '../../../../../components/FilePreview/FilePreview.js';
import {Button} from '../../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../../primitives/IconButton/IconButton.js';
import {Spinner} from '../../../../../primitives/Spinner/Spinner.js';
import {notifyErrors} from '../../../../../utils/notifications.js';
import {getNestedValue} from '../../../../../utils/objects.js';
import {useDocPickerModal} from '../../../../collections/components/DocPickerModal/useDocPickerModal.js';
import {getDocFromCacheOrFetch} from '../../../doc-cache.js';
import {parseDocId} from '../../../doc.js';
import {useDraftDocValue} from '../../../useDraftDoc.js';
import {useReferenceFieldEditorModal} from '../../ReferenceFieldEditorModal/useReferenceFieldEditorModal.js';
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
  const referenceFieldEditorModal = useReferenceFieldEditorModal();

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
        <div className="ReferenceField__ref mb-4 flex gap-1">
          <ReferenceField.Preview id={refId} />
          <div className="ReferenceField__remove flex justify-end">
            <IconButton
              className="ReferenceField__remove__icon"
              label="Quick edit"
              onClick={() => referenceFieldEditorModal.open({docId: refId})}
            >
              <IconPencil />
            </IconButton>
            <IconButton
              className="ReferenceField__remove__icon"
              label="Remove"
              onClick={() => setValue(null)}
            >
              <IconTrash />
            </IconButton>
          </div>
        </div>
      ) : (
        <div className="ReferenceField__none mb-4 font-mono">None selected</div>
      )}
      <Button variant="primary" onClick={() => openDocPicker()}>
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
    <div className="ReferenceField__Preview w-full min-w-0 flex-1">
      {loading ? (
        <div className="ReferenceField__Preview__loading text-muted">
          <Spinner size="lg" />
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
      <div className="ReferenceField__DocCard ReferenceField__DocCard--error flex items-center overflow-hidden break-all border border-border p-2">
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
      className="ReferenceField__DocCard flex items-center overflow-hidden border border-border p-2 text-inherit no-underline"
      href={`/cms/content/${docId}`}
      target="_blank"
    >
      <div className="ReferenceField__DocCard__image shrink-0 border border-border">
        <FilePreview
          file={previewImage}
          width={80}
          height={60}
          withPlaceholder={!previewImage?.src}
        />
      </div>
      <div className="ReferenceField__DocCard__content block min-w-0 flex-1 px-2">
        <div className="ReferenceField__DocCard__content__header">
          <div className="ReferenceField__DocCard__content__header__docId mb-1 text-sm font-medium leading-tight">
            {docId}
          </div>
        </div>
        <div className="ReferenceField__DocCard__content__title line-clamp-1 text-xl font-semibold leading-tight">
          {previewTitle || '[UNTITLED]'}
        </div>
      </div>
    </a>
  );
};
