import './AiEditModal.css';

import {Button, JsonInput, Tabs} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {
  IconArrowBackUp,
  IconCheck,
  IconFileDiff,
  IconJson,
  IconRecycle,
} from '@tabler/icons-preact';
import {useRef, useState} from 'preact/hooks';
import {ParsedChatResponse} from '../../../shared/ai/prompts.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {JsDiff} from '../JsDiff/JsDiff.js';
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
        size: 'calc(min(1920px, 100%))',
      });
    },
    close: () => {
      modals.closeModal(MODAL_ID);
    },
  };
}

export function AiEditModal(modalProps: ContextModalProps<AiEditModalProps>) {
  const {innerProps: props, context, id} = modalProps;
  const diffTabRef = useRef<HTMLButtonElement | null>(null);
  const originalValue = JSON.stringify(props.data || {}, null, 2);
  const [value, setValue] = useState(originalValue);
  const [valid, setValid] = useState(true);
  const [changed, setChanged] = useState(false);

  function onChange(s: string) {
    setValue(s);
    try {
      JSON.parse(s);
      setValid(true);
    } catch (e) {
      setValid(false);
    }
    setChanged(s !== originalValue);
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
          <Tabs className="AiEditModal__Tabs" grow>
            <Tabs.Tab label="JSON" icon={<IconJson size={14} />}>
              <div className="AiEditModal__JsonEditor">
                <JsonInput
                  value={value}
                  onChange={onChange}
                  formatOnBlur
                  height="100%"
                  className="AiEditModal__JsonInput"
                />
              </div>
            </Tabs.Tab>
            <Tabs.Tab
              ref={diffTabRef}
              label="Diff"
              icon={<IconFileDiff size={14} />}
            >
              <div className="AiEditModal__JsonDiffViewer">
                {props.data && value && (
                  <JsDiff
                    oldCode={JSON.stringify(props.data, null, 2)}
                    newCode={value}
                  />
                )}
              </div>
            </Tabs.Tab>
          </Tabs>
        </div>
        <div className="AiEditModal__SplitPanel__ChatPanel">
          <ChatPanel
            editModeData={JSON.parse(value)}
            onEditModeResponse={(resp: ParsedChatResponse) => {
              const newValue = JSON.stringify(resp.data, null, 2);
              setValue(newValue);
              setChanged(newValue !== originalValue);
              // Show the diff automatically when the AI is done editing.
              if (diffTabRef.current) {
                diffTabRef.current.click();
              }
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
          variant="default"
          size="xs"
          type="button"
          leftIcon={<IconArrowBackUp size={16} />}
          disabled={!changed}
          onClick={() => {
            setValue(originalValue);
            setValid(true);
            setChanged(false);
          }}
        >
          Reset
        </Button>
        <Button
          leftIcon={<IconCheck size={16} />}
          variant="filled"
          size="xs"
          color="green"
          disabled={!valid || !changed}
          onClick={onSave}
        >
          Accept changes
        </Button>
      </div>
    </div>
  );
}

AiEditModal.id = MODAL_ID;
