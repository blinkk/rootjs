import {useState} from 'preact/hooks';
import {useModalTheme} from '../../../../hooks/useModalTheme.js';
import {ContextModalProps, useModals} from '@mantine/modals';
import {FieldEditor} from '../../../FieldEditor/FieldEditor.js';
import * as schema from '../../../../../core/schema.js';
import {Button} from '@mantine/core';
import './EmbedModal.css';

const MODAL_ID = 'EmbedModal';

export interface EmbedModalProps {
  [key: string]: unknown;
  title?: string;
  schema: schema.Schema;
  value?: any;
  onSave: (value: any) => void;
}

export function useEmbedModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: EmbedModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
        size: '680px',
        title: props.title,
      });
    },
    close: () => {
      modals.closeModal(MODAL_ID);
    },
  };
}

export function EmbedModal(modalProps: ContextModalProps<EmbedModalProps>) {
  const {innerProps: props, context, id} = modalProps;
  const [value, setValue] = useState(props.value || {});

  function onSave() {
    if (props.onSave) {
      props.onSave(value);
    }
    context.closeModal(id);
  }

  return (
    <div className="EmbedModal">
      <FieldEditor
        schema={props.schema}
        value={props.value}
        onChange={(newValue) => setValue(newValue)}
      />
      <div className="EmbedModal__buttons">
        <Button
          variant="default"
          size="xs"
          color="dark"
          type="button"
          onClick={() => context.closeModal(id)}
        >
          Cancel
        </Button>
        <Button
          variant="filled"
          size="xs"
          color="blue"
          onClick={onSave}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

EmbedModal.id = MODAL_ID;
