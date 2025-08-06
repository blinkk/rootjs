import './AiEditModal.css';

import {Button, JsonInput} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {IconClipboard, IconDeviceFloppy} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {ParsedChatResponse} from '../../../shared/ai/prompts.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {ChatPanel} from './ChatPanel.js';

const MODAL_ID = 'AiEditModal';

export interface AiEditModalProps {
  [key: string]: unknown;
  title?: string;
  data?: any;
  onSave: (data: any) => void;
}

export function useAiEditModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: AiEditModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title: props.title || 'Edit with AI (Experimental)',
        innerProps: props,
        size: 'calc(min(1024px, 100%))',
      });
    },
    close: () => {
      modals.closeModal(MODAL_ID);
    },
  };
}

export function AiEditModal(modalProps: ContextModalProps<AiEditModalProps>) {
  const {innerProps: props, context, id} = modalProps;
  const [value, setValue] = useState(JSON.stringify(props.data || {}, null, 2));
  const [valid, setValid] = useState(true);
  const [copied, setCopied] = useState(false);

  function onChange(s: string) {
    setValue(s);
    setCopied(false);
    try {
      JSON.parse(s);
      setValid(true);
    } catch (e) {
      setValid(false);
    }
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
    <div className="AiEditModal">
      <div className="AiEditModal__SplitPanel">
        <div className="AiEditModal__SplitPanel__JsonPanel">
          <JsonInput
            value={value}
            onChange={onChange}
            formatOnBlur
            height="100%"
            className="AiEditModal__JsonInput"
          />
        </div>
        <div className="AiEditModal__SplitPanel__ChatPanel">
          <ChatPanel
            editModeData={JSON.parse(value)}
            onEditModeResponse={(resp: ParsedChatResponse) => {
              setValue(JSON.stringify(resp.data, null, 2));
            }}
          >
            <p>
              Tell me what you want to change. I can make simple text edits,
              replace content within a module, or answer questions about the
              content.
            </p>
            <p>
              Just enter simple instructions, or attach a screenshot and ask me
              to use it as reference.
            </p>
          </ChatPanel>
        </div>
      </div>
      <div className="AiEditModal__buttons">
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
          leftIcon={<IconDeviceFloppy size={16} />}
          variant="filled"
          size="xs"
          color="blue"
          disabled={!valid}
          onClick={onSave}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

AiEditModal.id = MODAL_ID;
