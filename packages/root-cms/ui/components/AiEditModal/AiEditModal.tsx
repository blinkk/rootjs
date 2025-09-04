import './AiEditModal.css';

import {Button, JsonInput, Tabs} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {
  IconArrowBackUp,
  IconCheck,
  IconFileDiff,
  IconJson,
} from '@tabler/icons-preact';
import {useRef, useState} from 'preact/hooks';
import {useMemo, useCallback} from 'preact/hooks';
import {AiResponse} from '../../../shared/ai/prompts.js';
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
        size: 'calc(min(1920px, calc(100% - 96px)))',
        centered: true,
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

  const originalValue = useMemo(
    () => JSON.stringify(props.data || {}, null, 2),
    [props.data]
  );
  const [value, setValue] = useState(originalValue);

  const parsedValue = useMemo(() => {
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }, [value]);

  const changed = useMemo(
    () => value !== originalValue,
    [value, originalValue]
  );

  const onChange = useCallback((s: string) => {
    setValue(s);
  }, []);

  const onSave = useCallback(() => {
    if (!parsedValue) {
      return;
    }
    if (props.onSave) {
      props.onSave(parsedValue);
    }
  }, [value, props]);

  const onReset = useCallback(() => {
    setValue(originalValue);
  }, [originalValue]);

  const handleEditModeResponse = useCallback((resp: AiResponse) => {
    if (resp?.data) {
      const newValue = JSON.stringify(resp.data, null, 2);
      setValue(newValue);
      // Show the diff automatically when the AI is done editing.
      diffTabRef.current?.click();
    }
  }, []);

  return (
    <div className="AiEditModal">
      <div className="AiEditModal__SplitPanel">
        <div className="AiEditModal__SplitPanel__JsonPanel">
          <Tabs className="AiEditModal__Tabs" grow>
            <Tabs.Tab label="JSON" icon={<IconJson size={20} />}>
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
              icon={<IconFileDiff size={20} />}
            >
              <div className="AiEditModal__JsonDiffViewer">
                {props.data && value && (
                  <JsDiff oldCode={originalValue} newCode={value} />
                )}
              </div>
            </Tabs.Tab>
          </Tabs>
        </div>
        <div className="AiEditModal__SplitPanel__ChatPanel">
          <ChatPanel
            editModeData={parsedValue}
            onEditModeResponse={handleEditModeResponse}
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
          onClick={onReset}
        >
          Reset
        </Button>
        <Button
          leftIcon={<IconCheck size={16} />}
          variant="filled"
          size="xs"
          color="green"
          disabled={!parsedValue || !changed}
          onClick={onSave}
        >
          Accept changes
        </Button>
      </div>
    </div>
  );
}

AiEditModal.id = MODAL_ID;
