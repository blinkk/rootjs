import {Button, Group, Modal, Stack, Text, TextInput} from '@mantine/core';
import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../../../core/schema.js';
import {
  DraftDocContext,
  DraftDocContextProvider,
} from '../../../../hooks/useDraftDoc.js';
import {cloneData} from '../../../../utils/objects.js';
import {DocEditor} from '../../../DocEditor/DocEditor.js';
import {InMemoryDraftDocController} from '../utils/InMemoryDraftDocController.js';

interface InlineComponentModalProps {
  schema: schema.Schema;
  opened: boolean;
  componentId: string;
  initialValue: Record<string, any>;
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSubmit: (value: {componentId: string; data: Record<string, any>}) => void;
}

export function InlineComponentModal(props: InlineComponentModalProps) {
  const [componentId, setComponentId] = useState(props.componentId);

  useEffect(() => {
    setComponentId(props.componentId);
  }, [props.componentId]);

  const controller = useMemo(
    () => new InMemoryDraftDocController(props.initialValue || {}, 'component'),
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
      id: 'component',
      label: props.schema.label || props.schema.name,
      variant: 'inline',
      fields: props.schema.fields,
    }),
    [props.schema]
  );

  const handleSubmit = () => {
    const value = controller.getValue('component') || {};
    const clonedValue = cloneData(value);
    props.onSubmit({componentId: componentId.trim(), data: clonedValue});
  };

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title={props.schema.label || props.schema.name}
      size="lg"
    >
      <Stack spacing="md">
        <TextInput
          label="Component ID"
          value={componentId}
          onChange={(event) => setComponentId(event.currentTarget.value)}
          placeholder="component-id"
          required
        />
        {props.schema.fields.length > 0 ? (
          <DraftDocContextProvider value={draftContext}>
            <DocEditor.ObjectField field={objectField} deepKey="component" />
          </DraftDocContextProvider>
        ) : (
          <Text size="sm" color="dimmed">
            This component does not define any editable fields.
          </Text>
        )}
        <Group position="right" spacing="sm">
          <Button variant="default" size="xs" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            size="xs"
            onClick={handleSubmit}
            disabled={!componentId.trim()}
          >
            {props.mode === 'edit' ? 'Save component' : 'Insert component'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
