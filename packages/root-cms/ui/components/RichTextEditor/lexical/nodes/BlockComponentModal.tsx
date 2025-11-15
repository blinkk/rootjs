import {Button, Group, Modal, Stack, Text} from '@mantine/core';
import {useMemo} from 'preact/hooks';
import * as schema from '../../../../../core/schema.js';
import {
  DraftDocContext,
  DraftDocContextProvider,
} from '../../../../hooks/useDraftDoc.js';
import {cloneData} from '../../../../utils/objects.js';
import {DocEditor} from '../../../DocEditor/DocEditor.js';
import {InMemoryDraftDocController} from '../utils/InMemoryDraftDocController.js';

interface BlockComponentModalProps {
  schema: schema.Schema;
  opened: boolean;
  initialValue: Record<string, any>;
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSubmit: (value: Record<string, any>) => void;
}

export function BlockComponentModal(props: BlockComponentModalProps) {
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
  };

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title={props.schema.label || props.schema.name}
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
        <Group position="right" spacing="sm">
          <Button variant="default" size="xs" onClick={props.onClose}>
            Cancel
          </Button>
          <Button size="xs" onClick={handleSubmit}>
            {props.mode === 'edit' ? 'Save block' : 'Insert block'}
          </Button>
        </Group>
      </Stack>
    </Modal>
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
