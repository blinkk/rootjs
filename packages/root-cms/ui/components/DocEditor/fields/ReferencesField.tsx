import './ReferencesField.css';

import {DragDropContext, Droppable, Draggable, DropResult} from '@hello-pangea/dnd';
import {ActionIcon, Button, Tooltip} from '@mantine/core';
import {IconGripVertical, IconTrash} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDoc, useDraftDocField} from '../../../hooks/useDraftDoc.js';
import {joinClassNames} from '../../../utils/classes.js';
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
        <DragDropContext
          onDragEnd={(result: DropResult) => {
            const {destination, source} = result;
            if (!destination || destination.index === source.index) {
              return;
            }
            const next = [...refIds];
            const [removed] = next.splice(source.index, 1);
            next.splice(destination.index, 0, removed);
            onChange(next);
          }}
        >
          <Droppable droppableId="ReferencesField__droppable" direction="vertical">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="ReferencesField__refs"
              >
                {refIds.map((id, index) => (
                  <Draggable key={id} draggableId={id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={joinClassNames(
                          'ReferencesField__card',
                          snapshot.isDragging && 'ReferencesField__card--dragging'
                        )}
                      >
                        <div
                          className="ReferencesField__card__handle"
                          {...provided.dragHandleProps}
                        >
                          <IconGripVertical size={16} stroke={'1.5'} />
                        </div>
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
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <div className="ReferencesField__none">None selected</div>
      )}
      <Button color="dark" size="xs" onClick={() => openDocSelectModal()}>
        {field.buttonLabel || 'Select'}
      </Button>
    </div>
  );
}
