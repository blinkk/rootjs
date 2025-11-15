import {Button, Group, Stack, Text, TextInput} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../../../core/schema.js';
import {
  DraftDocContext,
  DraftDocContextProvider,
} from '../../../../hooks/useDraftDoc.js';
import {useModalTheme} from '../../../../hooks/useModalTheme.js';
import {cloneData} from '../../../../utils/objects.js';
import {DocEditor} from '../../../DocEditor/DocEditor.js';
import {InMemoryDraftDocController} from '../utils/InMemoryDraftDocController.js';

const MODAL_ID = 'InlineComponentModal';

export interface InlineComponentModalProps {
  schema: schema.Schema;
  componentId: string;
  initialValue: Record<string, any>;
  mode?: 'create' | 'edit';
  onSubmit: (value: {componentId: string; data: Record<string, any>}) => void;
}

export function InlineComponentModal(
  modalProps: ContextModalProps<InlineComponentModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
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
    context.closeModal(id);
  };

  return (
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
        <Button variant="default" size="xs" onClick={() => context.closeModal(id)}>
          Cancel
        </Button>
        <Button size="xs" onClick={handleSubmit} disabled={!componentId.trim()}>
          {props.mode === 'edit' ? 'Save component' : 'Insert component'}
        </Button>
      </Group>
    </Stack>
  );
}

InlineComponentModal.id = MODAL_ID;

export function useInlineComponentModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: InlineComponentModalProps) =>
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
        size: 'lg',
        title: props.schema.label || props.schema.name,
      }),
    close: () => modals.closeModal(MODAL_ID),
  };
}
