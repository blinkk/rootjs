import {useMemo} from 'preact/hooks';
import * as schema from '../../../../../../../core/schema.js';
import {Button} from '../../../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../../../primitives/Dialog/Dialog.js';
import {cloneData} from '../../../../../../utils/objects.js';
import {
  DraftDocContext,
  DraftDocContextProvider,
  useOptionalDraftDoc,
} from '../../../../useDraftDoc.js';
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
  // Preserve the parent doc's id so that translations are loaded and saved
  // for the actual doc rather than the block.
  const parentController = useOptionalDraftDoc()?.controller || null;
  const controller = useMemo(
    () =>
      new InMemoryDraftDocController(props.initialValue || {}, 'block', {
        parent: parentController,
      }),
    [props.schema, props.initialValue, parentController]
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
    <Dialog
      className="BlockComponentModal"
      open={props.opened}
      onClose={props.onClose}
      title={props.schema.label || props.schema.name}
      size="lg"
      classNames={{body: 'flex flex-col gap-4'}}
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="blue" onClick={handleSubmit}>
            {props.mode === 'edit' ? 'Save block' : 'Insert block'}
          </Button>
        </>
      }
    >
      {props.schema.fields.length > 0 ? (
        <DraftDocContextProvider value={draftContext}>
          <DocEditor.ObjectField field={objectField} deepKey="block" />
        </DraftDocContextProvider>
      ) : (
        <p className="BlockComponentModal__empty m-0 text-sm text-muted">
          This block does not define any editable fields.
        </p>
      )}
    </Dialog>
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
