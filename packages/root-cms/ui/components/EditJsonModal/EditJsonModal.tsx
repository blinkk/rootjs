import {Button, JsonInput} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {
  IconArrowBackUp,
  IconClipboard,
  IconDeviceFloppy,
} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import './EditJsonModal.css';

const MODAL_ID = 'EditJsonModal';

export interface EditJsonModalProps {
  [key: string]: unknown;
  title?: string;
  data?: any;
  onSave: (data: any) => void;
}

export function useEditJsonModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: EditJsonModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title: props.title || 'Edit JSON',
        innerProps: props,
        size: '680px',
        centered: true,
      });
    },
    close: () => {
      modals.closeModal(MODAL_ID);
    },
  };
}

export function EditJsonModal(
  modalProps: ContextModalProps<EditJsonModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const initialValue = JSON.stringify(props.data || {}, null, 2);
  const [value, setValue] = useState(initialValue);
  const [valid, setValid] = useState(true);
  const [copied, setCopied] = useState(false);
  const [changed, setChanged] = useState(false);

  function onChange(s: string) {
    setValue(s);
    setCopied(false);
    try {
      JSON.parse(s);
      setValid(true);
    } catch (e) {
      setValid(false);
    }
    setChanged(s !== initialValue);
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(value).then(() => setCopied(true));
  }

  function onSave() {
    const data = JSON.parse(value);
    if (props.onSave) {
      props.onSave(data);
    }
  }

  return (
    <div className="EditJsonModal">
      <JsonInput
        value={value}
        onChange={onChange}
        formatOnBlur
        autosize
        minRows={4}
        maxRows={25}
      />
      <div className="EditJsonModal__buttons">
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
          leftIcon={<IconClipboard size={16} />}
          variant="filled"
          size="xs"
          color="dark"
          disabled={!valid}
          type="button"
          onClick={copyToClipboard}
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
        <Button
          variant="default"
          size="xs"
          type="button"
          leftIcon={<IconArrowBackUp size={16} />}
          disabled={!changed}
          onClick={() => {
            setValue(initialValue);
            setValid(true);
            setChanged(false);
          }}
        >
          Reset
        </Button>
        <Button
          leftIcon={<IconDeviceFloppy size={16} />}
          variant="filled"
          size="xs"
          color="blue"
          disabled={!valid || !changed}
          onClick={onSave}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

EditJsonModal.id = MODAL_ID;
