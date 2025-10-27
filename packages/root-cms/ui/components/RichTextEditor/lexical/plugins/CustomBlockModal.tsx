import {Button, Group, Modal, Stack, Text} from '@mantine/core';
import {useMemo} from 'preact/hooks';
import * as schema from '../../../../../core/schema.js';
import {
  DraftDocContext,
  DraftDocContextProvider,
} from '../../../../hooks/useDraftDoc.js';
import {getNestedValue} from '../../../../utils/objects.js';
import {DocEditor} from '../../../DocEditor/DocEditor.js';

interface CustomBlockModalProps {
  schema: schema.Schema;
  opened: boolean;
  initialValue: Record<string, any>;
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSubmit: (value: Record<string, any>) => void;
}

type Listener = (value: any) => void;

class InMemoryDraftDocController {
  private data: Record<string, any>;
  private listeners = new Map<string, Set<Listener>>();

  docId = 'custom-block';
  collectionId = 'custom-block';
  slug = 'custom-block';

  constructor(initialValue: Record<string, any>) {
    this.data = {block: structuredCloneIfAvailable(initialValue)};
  }

  getValue(key: string): any {
    return getNestedValue(this.data, key);
  }

  async updateKey(key: string, value: any) {
    setNestedValue(this.data, key, value);
    this.notify(key);
  }

  async updateKeys(updates: Record<string, any>) {
    for (const [key, value] of Object.entries(updates)) {
      setNestedValue(this.data, key, value);
      this.notify(key);
    }
  }

  async removeKey(key: string) {
    deleteNestedValue(this.data, key);
    this.notify(key);
  }

  subscribe(key: string, cb: Listener) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(cb);
    cb(this.getValue(key));
    return () => {
      this.listeners.get(key)?.delete(cb);
    };
  }

  getDataSnapshot() {
    return structuredCloneIfAvailable(this.data);
  }

  getData() {
    return this.getDataSnapshot();
  }

  private notify(key: string) {
    for (const target of getKeyHierarchy(key)) {
      const listeners = this.listeners.get(target);
      if (!listeners) {
        continue;
      }
      const value = this.getValue(target);
      listeners.forEach((cb) => cb(value));
    }
  }
}

function structuredCloneIfAvailable<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function setNestedValue(target: Record<string, any>, key: string, value: any) {
  const parts = key.split('.');
  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      typeof current[part] !== 'object' ||
      current[part] === null ||
      Array.isArray(current[part])
    ) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts.at(-1)!] = value;
}

function deleteNestedValue(target: Record<string, any>, key: string) {
  const parts = key.split('.');
  let current: Record<string, any> | undefined = target;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current?.[parts[i]];
    if (typeof current !== 'object' || current === null) {
      return;
    }
  }
  if (!current) {
    return;
  }
  delete current[parts.at(-1)!];
}

function getKeyHierarchy(key: string) {
  const parts = key.split('.');
  const keys: string[] = [];
  for (let i = parts.length; i > 0; i--) {
    keys.push(parts.slice(0, i).join('.'));
  }
  return keys;
}

export function CustomBlockModal(props: CustomBlockModalProps) {
  const controller = useMemo(
    () => new InMemoryDraftDocController(props.initialValue || {}),
    [props.schema, props.initialValue]
  );

  const draftContext: DraftDocContext = useMemo(
    () =>
      ({
        loading: false,
        controller: controller as unknown as DraftDocContext['controller'],
      }) as DraftDocContext,
    [controller]
  );

  const objectField = useMemo<schema.ObjectField>(
    () => ({
      type: 'object',
      id: 'block',
      label: props.schema.name,
      variant: 'inline',
      fields: props.schema.fields,
    }),
    [props.schema]
  );

  const handleSubmit = () => {
    const value = controller.getValue('block') || {};
    const clonedValue = structuredCloneIfAvailable(value);
    props.onSubmit(clonedValue);
  };

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title={props.schema.name}
      size="lg"
    >
      <Stack spacing="md">
        {props.schema.fields.length > 0 ? (
          <DraftDocContextProvider value={draftContext}>
            <DocEditor.ObjectField field={objectField} deepKey="block" />
          </DraftDocContextProvider>
        ) : (
          <Text size="sm" color="dimmed">
            This block does not define any editable fields.
          </Text>
        )}
        <Group position="right">
          <Button variant="default" onClick={props.onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            {props.mode === 'edit' ? 'Save block' : 'Insert block'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
