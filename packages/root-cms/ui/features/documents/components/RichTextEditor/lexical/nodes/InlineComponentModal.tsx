import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../../../../../core/schema.js';
import {Button} from '../../../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../../../primitives/Dialog/Dialog.js';
import {TextInput} from '../../../../../../primitives/TextInput/TextInput.js';
import {cloneData} from '../../../../../../utils/objects.js';
import {
  DraftDocContext,
  DraftDocContextProvider,
  useOptionalDraftDoc,
} from '../../../../useDraftDoc.js';
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

  // Preserve the parent doc's id so that translations are loaded and saved
  // for the actual doc rather than the component.
  const parentController = useOptionalDraftDoc()?.controller || null;
  const controller = useMemo(
    () =>
      new InMemoryDraftDocController(props.initialValue || {}, 'component', {
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
    <Dialog
      className="InlineComponentModal"
      open={props.opened}
      onClose={props.onClose}
      title={props.schema.label || props.schema.name}
      size="lg"
      classNames={{body: 'flex flex-col gap-4'}}
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            variant="blue"
            onClick={handleSubmit}
            disabled={!componentId.trim()}
          >
            {props.mode === 'edit' ? 'Save component' : 'Insert component'}
          </Button>
        </>
      }
    >
      <TextInput
        className="InlineComponentModal__componentId"
        size="md"
        label="Component ID"
        value={componentId}
        onInput={(event) => setComponentId(event.currentTarget.value)}
        placeholder="component-id"
        required
      />
      {props.schema.fields.length > 0 ? (
        <DraftDocContextProvider value={draftContext}>
          <DocEditor.ObjectField field={objectField} deepKey="component" />
        </DraftDocContextProvider>
      ) : (
        <p className="InlineComponentModal__empty m-0 text-sm text-muted">
          This component does not define any editable fields.
        </p>
      )}
    </Dialog>
  );
}
