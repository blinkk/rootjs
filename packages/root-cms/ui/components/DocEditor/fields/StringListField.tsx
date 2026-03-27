import './StringListField.css';

import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import {ActionIcon, Button, Tooltip} from '@mantine/core';
import {IconGripVertical, IconTrash} from '@tabler/icons-preact';
import {useRef} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {joinClassNames} from '../../../utils/classes.js';
import {FieldProps} from './FieldProps.js';

/**
 * Renders a multiselect field as a list of text inputs with drag-and-drop
 * reordering. Data is stored as a `string[]`, identical to the default
 * MultiSelect variant.
 */
export function StringListField(props: FieldProps) {
  const field = props.field as schema.MultiSelectField;
  const [value, setValue] = useDraftDocValue<string[]>(props.deepKey, []);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  function updateItem(index: number, text: string) {
    const next = [...(value || [])];
    next[index] = text;
    setValue(next);
  }

  function removeItem(index: number) {
    const next = [...(value || [])];
    next.splice(index, 1);
    setValue(next.length > 0 ? next : (null as any));
  }

  function addItem() {
    const next = [...(value || []), ''];
    setValue(next);
    // Focus the new input after render.
    requestAnimationFrame(() => {
      const el = inputRefs.current[next.length - 1];
      if (el) {
        el.focus();
      }
    });
  }

  function onDragEnd(result: DropResult) {
    const {destination, source} = result;
    if (!destination || destination.index === source.index) {
      return;
    }
    const next = [...(value || [])];
    const [removed] = next.splice(source.index, 1);
    next.splice(destination.index, 0, removed);
    setValue(next);
  }

  function onKeyDown(e: KeyboardEvent, index: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem();
    } else if (
      e.key === 'Backspace' &&
      (value || [])[index] === '' &&
      (value || []).length > 1
    ) {
      e.preventDefault();
      removeItem(index);
      // Focus the previous input.
      requestAnimationFrame(() => {
        const prevIndex = Math.max(0, index - 1);
        const el = inputRefs.current[prevIndex];
        if (el) {
          el.focus();
        }
      });
    }
  }

  const items = value || [];

  return (
    <div className="StringListField">
      {items.length > 0 && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable
            droppableId="StringListField__droppable"
            direction="vertical"
          >
            {(provided: any) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="StringListField__items"
              >
                {items.map((item, index) => (
                  <Draggable
                    key={index}
                    draggableId={`text-item-${index}`}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...(provided.draggableProps as any)}
                        className={joinClassNames(
                          'StringListField__item',
                          snapshot.isDragging &&
                            'StringListField__item--dragging'
                        )}
                      >
                        <div
                          className="StringListField__item__handle"
                          {...(provided.dragHandleProps as any)}
                        >
                          <IconGripVertical size={16} stroke={'1.5'} />
                        </div>
                        <div className="StringListField__item__input">
                          <input
                            ref={(el) => {
                              inputRefs.current[index] = el;
                            }}
                            type="text"
                            value={item}
                            placeholder={field.placeholder || 'Enter value'}
                            onInput={(e) => {
                              updateItem(
                                index,
                                (e.target as HTMLInputElement).value
                              );
                            }}
                            onKeyDown={(e) => onKeyDown(e, index)}
                          />
                        </div>
                        <div className="StringListField__item__remove">
                          <Tooltip label="Remove">
                            <ActionIcon
                              size="sm"
                              onClick={() => removeItem(index)}
                            >
                              <IconTrash size={14} />
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
      )}
      <div className="StringListField__add">
        <Button color="dark" size="xs" onClick={addItem}>
          Add
        </Button>
      </div>
    </div>
  );
}
