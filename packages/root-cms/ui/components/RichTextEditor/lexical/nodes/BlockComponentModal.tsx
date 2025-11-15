import {Button, Group, Stack, Text} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {useMemo} from 'preact/hooks';
import * as schema from '../../../../../core/schema.js';
import {
  DraftDocContext,
  DraftDocContextProvider,
} from '../../../../hooks/useDraftDoc.js';
import {useModalTheme} from '../../../../hooks/useModalTheme.js';
import {cloneData} from '../../../../utils/objects.js';
import {DocEditor} from '../../../DocEditor/DocEditor.js';
import {InMemoryDraftDocController} from '../utils/InMemoryDraftDocController.js';

const MODAL_ID = 'BlockComponentModal';

export interface BlockComponentModalProps {
  schema: schema.Schema;
  initialValue: Record<string, any>;
  mode?: 'create' | 'edit';
  onSubmit: (value: Record<string, any>) => void;
}

export function BlockComponentModal(
  modalProps: ContextModalProps<BlockComponentModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
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
      label: props.schema.label || props.schema.name,
      variant: 'inline',
      fields: props.schema.fields,
    }),
    [props.schema]
  );

  const handleSubmit = () => {
    const value = controller.getValue('block') || {};
    const clonedValue = cloneData(value);

    // For backwards compatibility with the legacy EditorJS editor, the "image"
    // field value is modified to include a preview url.
    if (props.schema.name === 'image' && clonedValue?.file?.src) {
      clonedValue.file.url = imagePreviewUrl(clonedValue.file.src);
    }
    props.onSubmit(clonedValue);
    context.closeModal(id);
  };

  return (
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
      <Group position="right" spacing="sm">
        <Button variant="default" size="xs" onClick={() => context.closeModal(id)}>
          Cancel
        </Button>
        <Button size="xs" onClick={handleSubmit}>
          {props.mode === 'edit' ? 'Save block' : 'Insert block'}
        </Button>
      </Group>
    </Stack>
  );
}

function imagePreviewUrl(src: string) {
  if (isGciUrl(src)) {
    return `${src}=s0-e365`;
  }
  return src;
}

function isGciUrl(url: string) {
  return url.startsWith('https://lh3.googleusercontent.com/');
}

BlockComponentModal.id = MODAL_ID;

export function useBlockComponentModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: BlockComponentModalProps) =>
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
        size: 'lg',
        title: props.schema.label || props.schema.name,
      }),
    close: () => modals.closeModal(MODAL_ID),
  };
}
