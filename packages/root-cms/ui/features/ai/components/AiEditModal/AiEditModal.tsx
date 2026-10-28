import './AiEditModal.css';

import {
  IconArrowBackUp,
  IconCheck,
  IconFileDiff,
  IconJson,
} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {useMemo, useCallback} from 'preact/hooks';
import {JsDiff} from '../../../../components/JsDiff/JsDiff.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {JsonInput} from '../../../../primitives/JsonInput/JsonInput.js';
import {
  type ContextModalProps,
  useModals,
} from '../../../../primitives/modals/ModalsProvider.js';
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '../../../../primitives/Tabs/Tabs.js';
import {deserializeDocJson} from '../../../documents/doc.js';
import {AiResponse, ChatPanel} from './ChatPanel.js';

const MODAL_ID = 'AiEditModal';

export interface AiEditModalProps {
  [key: string]: unknown;
  title?: string;
  data?: any;
  onSave: (data: any) => void;
}

export function useAiEditModal() {
  const modals = useModals();
  return {
    open: (props: AiEditModalProps) => {
      modals.openContextModal(MODAL_ID, {
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
  const [tab, setTab] = useState<string>('json');

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
    } catch {
      return null;
    }
  }, [value]);

  const changed = useMemo(
    () => value !== originalValue,
    [value, originalValue]
  );

  const onSave = useCallback(() => {
    if (!parsedValue) {
      return;
    }
    const newValue = deserializeDocJson(parsedValue);
    if (props.onSave) {
      props.onSave(newValue);
    }
  }, [parsedValue]);

  const handleEditModeResponse = useCallback((resp: AiResponse) => {
    if (resp?.data) {
      const newValue = JSON.stringify(resp.data, null, 2);
      setValue(newValue);
      // Show the diff automatically when the AI is done editing.
      setTab('diff');
    }
  }, []);

  return (
    <div className="AiEditModal">
      <div className="AiEditModal__SplitPanel grid grid-cols-1 gap-6 md:h-170 md:grid-cols-2">
        <div className="AiEditModal__SplitPanel__ChatPanel flex h-120 min-h-0 flex-col md:h-full">
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
        <div className="AiEditModal__SplitPanel__JsonPanel flex h-120 min-h-0 flex-col md:h-full">
          <Tabs
            className="AiEditModal__Tabs flex min-h-0 flex-1 flex-col"
            value={tab}
            onChange={setTab}
            grow
          >
            <TabList aria-label="Edit views">
              <Tab value="json" icon={<IconJson />}>
                JSON
              </Tab>
              <Tab value="diff" icon={<IconFileDiff />}>
                Diff
              </Tab>
            </TabList>
            <TabPanel
              value="json"
              className="AiEditModal__JsonEditor min-h-0 w-full flex-1"
            >
              <JsonInput
                aria-label="JSON"
                value={value}
                onValueChange={(newValue: string) => setValue(newValue)}
                formatOnBlur
                className="AiEditModal__JsonInput h-full w-full"
                inputClassName="h-full w-full resize-none text-sm leading-normal"
              />
            </TabPanel>
            <TabPanel value="diff" className="min-h-0 w-full flex-1">
              <div className="AiEditModal__JsonDiffViewer h-full w-full overflow-auto rounded-sm border border-border-strong">
                {props.data && value && (
                  <JsDiff
                    className="h-full"
                    oldCode={originalValue}
                    newCode={value}
                  />
                )}
              </div>
            </TabPanel>
          </Tabs>
        </div>
      </div>
      <div className="AiEditModal__buttons mt-6 flex flex-wrap justify-end gap-3">
        <Button
          variant="default"
          size="xs"
          type="button"
          onClick={() => context.closeModal(id)}
        >
          Cancel
        </Button>
        <Button
          variant="default"
          size="xs"
          type="button"
          icon={<IconArrowBackUp />}
          disabled={!changed}
          onClick={() => setValue(originalValue)}
        >
          Reset
        </Button>
        <Button
          icon={<IconCheck />}
          variant="primary"
          size="xs"
          type="button"
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
