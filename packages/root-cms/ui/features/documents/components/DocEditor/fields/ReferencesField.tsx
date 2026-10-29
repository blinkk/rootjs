import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import {IconGripVertical, IconPencil, IconTrash} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import * as schema from '../../../../../../core/schema.js';
import {Button} from '../../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../../primitives/IconButton/IconButton.js';
import {cn} from '../../../../../utils/classes.js';
import {useDocPickerModal} from '../../../../collections/components/DocPickerModal/DocPickerModal.js';
import {DocPreviewCard} from '../../../../collections/components/DocPreviewCard/DocPreviewCard.js';
import {useDraftDoc, useDraftDocField} from '../../../useDraftDoc.js';
import {useReferenceFieldEditorModal} from '../../ReferenceFieldEditorModal/ReferenceFieldEditorModal.js';
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

  const docPickerModal = useDocPickerModal();
  const referenceFieldEditorModal = useReferenceFieldEditorModal();

  function openDocPickerModal() {
    docPickerModal.open({
      collections: field.collections,
      initialCollection: field.initialCollection,
      multiSelect: true,
      selectedDocIds: refIds,
      onChangeMulti: (docId: string, selected: boolean) => {
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
          <Droppable
            droppableId="ReferencesField__droppable"
            direction="vertical"
          >
            {(provided: any) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="ReferencesField__refs mb-4"
              >
                {refIds.map((refId, index) => (
                  <Draggable key={refId} draggableId={refId} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...(provided.draggableProps as any)}
                        className={cn(
                          'ReferencesField__card flex items-stretch gap-2 border-0 border-b border-solid border-border py-2.5 first:border-t',
                          snapshot.isDragging &&
                            'ReferencesField__card--dragging rounded-sm border bg-surface-hover shadow-md'
                        )}
                      >
                        <div
                          className="ReferencesField__card__handle flex cursor-grab items-center px-2 text-subtle active:cursor-grabbing"
                          {...(provided.dragHandleProps as any)}
                        >
                          <IconGripVertical size={16} stroke={'1.5'} />
                        </div>
                        <DocPreviewCard
                          className="ReferencesField__card__preview min-w-0 flex-1 p-0"
                          docId={refId}
                          variant="compact"
                          clickable
                          statusBadges
                        />
                        <div className="ReferencesField__card__controls flex items-start px-2">
                          <IconButton
                            label="Quick edit"
                            onClick={() =>
                              referenceFieldEditorModal.open({docId: refId})
                            }
                          >
                            <IconPencil />
                          </IconButton>
                          <IconButton
                            className="ReferencesField__card__controls__remove"
                            label="Remove"
                            onClick={() => removeDoc(refId)}
                          >
                            <IconTrash />
                          </IconButton>
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
        <div className="ReferencesField__none mb-4 font-mono">
          None selected
        </div>
      )}
      <Button variant="primary" onClick={() => openDocPickerModal()}>
        {field.buttonLabel || 'Select'}
      </Button>
    </div>
  );
}
