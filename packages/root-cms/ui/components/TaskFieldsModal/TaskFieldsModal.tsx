import './TaskFieldsModal.css';

import {ActionIcon, Button, Checkbox, Select, TextInput} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useState} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {errorMessage} from '../../utils/notifications.js';
import {
  setTaskFieldDefs,
  TaskFieldDef,
  TaskFieldType,
} from '../../utils/tasks.js';

const MODAL_ID = 'TaskFieldsModal';

const FIELD_TYPE_OPTIONS: Array<{value: TaskFieldType; label: string}> = [
  {value: 'text', label: 'Text'},
  {value: 'number', label: 'Number'},
  {value: 'date', label: 'Date'},
  {value: 'select', label: 'Single select'},
  {value: 'multiselect', label: 'Multi select'},
  {value: 'checkbox', label: 'Checkbox'},
];

export interface TaskFieldsModalProps {
  [key: string]: unknown;
  fieldDefs: TaskFieldDef[];
}

export function useTaskFieldsModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: TaskFieldsModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title: 'Task fields',
        innerProps: props,
        size: '720px',
        centered: true,
      });
    },
    close: () => modals.closeModal(MODAL_ID),
  };
}

/**
 * Edits the project's custom task field definitions. Field ids are derived
 * from the label on creation and then frozen, because changing an id would
 * orphan every value already stored against it.
 */
export function TaskFieldsModal(
  modalProps: ContextModalProps<TaskFieldsModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const [fieldDefs, setFieldDefs] = useState<TaskFieldDef[]>(
    props.fieldDefs || []
  );
  const [saving, setSaving] = useState(false);

  function updateFieldDef(index: number, updates: Partial<TaskFieldDef>) {
    setFieldDefs((current) =>
      current.map((fieldDef, i) =>
        i === index ? {...fieldDef, ...updates} : fieldDef
      )
    );
  }

  function moveFieldDef(index: number, offset: number) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= fieldDefs.length) {
      return;
    }
    setFieldDefs((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function addFieldDef() {
    setFieldDefs((current) => [
      ...current,
      {
        id: getUniqueFieldId('field', current),
        label: '',
        type: 'text',
        showInList: false,
      },
    ]);
  }

  async function onSave() {
    const invalid = fieldDefs.find((fieldDef) => !fieldDef.label.trim());
    if (invalid) {
      showNotification({
        title: 'Could not save fields',
        message: 'Every field needs a label.',
        color: 'red',
      });
      return;
    }
    setSaving(true);
    try {
      await setTaskFieldDefs(
        fieldDefs.map((fieldDef) => ({
          ...fieldDef,
          label: fieldDef.label.trim(),
        }))
      );
      context.closeModal(id);
    } catch (err) {
      showNotification({
        title: 'Could not save fields',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="TaskFieldsModal">
      <div className="TaskFieldsModal__intro">
        Custom fields appear on every task in this project. Enable "Show in
        list" to add the field as a column in the task table.
      </div>
      {fieldDefs.length === 0 && (
        <div className="TaskFieldsModal__empty">No custom fields yet.</div>
      )}
      <div className="TaskFieldsModal__fields">
        {fieldDefs.map((fieldDef, index) => (
          <div className="TaskFieldsModal__field" key={fieldDef.id}>
            <div className="TaskFieldsModal__field__row">
              <TextInput
                className="TaskFieldsModal__field__label"
                size="xs"
                label="Label"
                value={fieldDef.label}
                placeholder="Request type"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const label = e.currentTarget.value;
                  // Keep the id in step with the label until the field has
                  // been saved once; after that the id is load-bearing.
                  const isNew = !props.fieldDefs.some(
                    (saved) => saved.id === fieldDef.id
                  );
                  updateFieldDef(index, {
                    label,
                    ...(isNew && label.trim()
                      ? {
                          id: getUniqueFieldId(
                            label,
                            fieldDefs.filter((_, i) => i !== index)
                          ),
                        }
                      : {}),
                  });
                }}
              />
              <Select
                className="TaskFieldsModal__field__type"
                size="xs"
                label="Type"
                data={FIELD_TYPE_OPTIONS}
                value={fieldDef.type}
                onChange={(value: TaskFieldType | null) =>
                  updateFieldDef(index, {type: value || 'text'})
                }
              />
              <div className="TaskFieldsModal__field__actions">
                <ActionIcon
                  size="sm"
                  aria-label="Move field up"
                  disabled={index === 0}
                  onClick={() => moveFieldDef(index, -1)}
                >
                  <IconArrowUp size={15} strokeWidth="1.8" />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  aria-label="Move field down"
                  disabled={index === fieldDefs.length - 1}
                  onClick={() => moveFieldDef(index, 1)}
                >
                  <IconArrowDown size={15} strokeWidth="1.8" />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  aria-label="Remove field"
                  onClick={() =>
                    setFieldDefs((current) =>
                      current.filter((_, i) => i !== index)
                    )
                  }
                >
                  <IconTrash size={15} strokeWidth="1.8" />
                </ActionIcon>
              </div>
            </div>
            {(fieldDef.type === 'select' ||
              fieldDef.type === 'multiselect') && (
              <TextInput
                size="xs"
                label="Options (comma separated)"
                value={(fieldDef.options || [])
                  .map((option) => option.label)
                  .join(', ')}
                placeholder="Bug, Feature, Content"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateFieldDef(index, {
                    options: parseFieldOptions(e.currentTarget.value),
                  })
                }
              />
            )}
            <div className="TaskFieldsModal__field__footer">
              <Checkbox
                size="xs"
                label="Show in list"
                checked={Boolean(fieldDef.showInList)}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateFieldDef(index, {showInList: e.currentTarget.checked})
                }
              />
              <code className="TaskFieldsModal__field__id">{fieldDef.id}</code>
            </div>
          </div>
        ))}
      </div>
      <div className="TaskFieldsModal__actions">
        <Button
          compact
          size="xs"
          variant="default"
          leftIcon={<IconPlus size={14} strokeWidth="1.8" />}
          onClick={addFieldDef}
        >
          Add field
        </Button>
        <div className="TaskFieldsModal__actions__right">
          <Button
            compact
            size="xs"
            variant="default"
            onClick={() => context.closeModal(id)}
          >
            Cancel
          </Button>
          <Button
            compact
            size="xs"
            color="dark"
            loading={saving}
            onClick={onSave}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

TaskFieldsModal.id = MODAL_ID;

/** Parses the comma-separated options input into option objects. */
function parseFieldOptions(value: string) {
  const seen = new Set<string>();
  return value
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label) => ({value: toFieldSlug(label) || label, label}))
    .filter((option) => {
      if (seen.has(option.value)) {
        return false;
      }
      seen.add(option.value);
      return true;
    });
}

/** Lower-cases a label into a slug usable as a field or option key. */
function toFieldSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Derives a stable, collision-free field id from a label. */
function getUniqueFieldId(label: string, fieldDefs: TaskFieldDef[]) {
  const base = toFieldSlug(label) || 'field';
  const taken = new Set(fieldDefs.map((fieldDef) => fieldDef.id));
  if (!taken.has(base)) {
    return base;
  }
  let index = 2;
  while (taken.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}
