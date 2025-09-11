import './ReferencesField.css';

import {ActionIcon, Button, Tooltip} from '@mantine/core';
import {IconTrash} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDoc, useDraftDocField} from '../../../hooks/useDraftDoc.js';
import {DocPreviewCard} from '../../DocPreviewCard/DocPreviewCard.js';
import {useDocSelectModal} from '../../DocSelectModal/DocSelectModal.js';
import {FieldProps} from './FieldProps.js';
import {ReferenceFieldValue} from './ReferenceField.js';

export function ReferencesField(props: FieldProps) {
  const field = props.field as schema.ReferencesField;
  const [refIds, setRefIds] = useState<string[]>([]);
  const draft = useDraftDoc().controller;

  function onChange(newIds: string[]) {
    if (newIds.length) {
      const refs = newIds.map((id) => {
        const [collection, slug] = id.split('/');
        return {id, collection, slug};
      });
      draft.updateKey(props.deepKey, refs);
    } else {
      draft.removeKey(props.deepKey);
    }
    setRefIds(newIds);
  }

  useDraftDocField(props.deepKey, (newValue?: ReferenceFieldValue[]) => {
    if (Array.isArray(newValue)) {
      setRefIds(newValue.map((v) => v.id));
    } else {
      setRefIds([]);
    }
  });

  const docSelectModal = useDocSelectModal();

  function openDocSelectModal() {
    docSelectModal.open({
      collections: field.collections,
      initialCollection: field.initialCollection,
      selectedDocIds: refIds,
      onChange: (docId: string, selected: boolean) => {
        setRefIds((old) => {
          const next = [...old];
          if (selected) {
            if (!next.includes(docId)) {
              next.push(docId);
            }
          } else {
            const i = next.indexOf(docId);
            if (i > -1) {
              next.splice(i, 1);
            }
          }
          onChange(next);
          return next;
        });
      },
    });
  }

  function removeDoc(id: string) {
    const next = refIds.filter((x) => x !== id);
    onChange(next);
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
