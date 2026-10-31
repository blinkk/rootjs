import {
  IconArrowBackUp,
  IconClipboard,
  IconDeviceFloppy,
} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {Button} from '../../../../primitives/Button/Button.js';
import {JsonInput} from '../../../../primitives/JsonInput/JsonInput.js';
import type {ContextModalProps} from '../../../../primitives/modals/ModalsProvider.js';
import {deserializeDocJson} from '../../doc.js';
import {EDIT_JSON_MODAL_ID} from './useEditJsonModal.js';

export interface EditJsonModalProps {
  [key: string]: unknown;
  title?: string;
  data?: any;
  onSave: (data: any) => void;
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
    } catch {
      setValid(false);
    }
    setChanged(s !== initialValue);
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(value).then(() => setCopied(true));
  }

  function onSave() {
    const data = JSON.parse(value);
    const newValue = deserializeDocJson(data);
    if (props.onSave) {
      props.onSave(newValue);
    }
  }

  return (
    <div className="EditJsonModal">
      <JsonInput
        aria-label="JSON"
        value={value}
        onValueChange={onChange}
        formatOnBlur
        autosize
        minRows={4}
        maxRows={25}
      />
      <div className="EditJsonModal__buttons mt-6 flex flex-wrap justify-end gap-3">
        <Button type="button" onClick={() => context.closeModal(id)}>
          Cancel
        </Button>
        <Button
          icon={<IconClipboard />}
          variant="primary"
          disabled={!valid}
          type="button"
          onClick={copyToClipboard}
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
        <Button
          type="button"
          icon={<IconArrowBackUp />}
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
          icon={<IconDeviceFloppy />}
          variant="blue"
          disabled={!valid || !changed}
          onClick={onSave}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

EditJsonModal.id = EDIT_JSON_MODAL_ID;
