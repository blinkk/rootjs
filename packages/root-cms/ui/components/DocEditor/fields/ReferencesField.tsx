import './ReferencesField.css';

import {ActionIcon, Button, Tooltip} from '@mantine/core';
import {IconTrash} from '@tabler/icons-preact';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {parseDocId} from '../../../utils/doc.js';
import {DocPreviewCard} from '../../DocPreviewCard/DocPreviewCard.js';
import {useDocSelectModal} from '../../DocSelectModal/DocSelectModal.js';
import {FieldProps} from './FieldProps.js';
import {ReferenceFieldValue} from './ReferenceField.js';

export function ReferencesField(props: FieldProps) {
  const field = props.field as schema.ReferencesField;
  const [value, setValue] = useDraftDocValue<ReferenceFieldValue[]>(
    props.deepKey,
    []
  );
  const refIds = value.map((ref) => ref.id);

  function onChange(newRefIds: string[]) {
    if (newRefIds.length) {
      const refs = newRefIds.map((refId) => parseDocId(refId));
      setValue(refs);
    } else {
      setValue([]);
    }
  }

  const docSelectModal = useDocSelectModal();

  function openDocSelectModal() {
    docSelectModal.open({
      collections: field.collections,
      initialCollection: field.initialCollection,
      selectedDocIds: refIds,
      onChange: (docId: string, selected: boolean) => {
        const newRefIds = [...refIds];
        if (selected) {
          if (!newRefIds.includes(docId)) {
            newRefIds.push(docId);
          }
        } else {
          const i = newRefIds.indexOf(docId);
          if (i > -1) {
            newRefIds.splice(i, 1);
          }
        }
        onChange(newRefIds);
      },
    });
  }

  function removeDoc(id: string) {
    const newRefIds = refIds.filter((x) => x !== id);
    onChange(newRefIds);
  }

  return (
    <div className="ReferencesField">
      {refIds.length > 0 ? (
        <div className="ReferencesField__refs">
          {refIds.map((id) => (
            <div key={id} className="ReferencesField__card">
              <DocPreviewCard
                className="ReferencesField__card__preview"
                docId={id}
                variant="compact"
              />
              <div className="ReferencesField__card__controls">
                <Tooltip label="Remove">
                  <ActionIcon
                    className="ReferencesField__card__controls__remove"
                    onClick={() => removeDoc(id)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="ReferencesField__none">None selected</div>
      )}
      <Button color="dark" size="xs" onClick={() => openDocSelectModal()}>
        {field.buttonLabel || 'Select'}
      </Button>
    </div>
  );
}
