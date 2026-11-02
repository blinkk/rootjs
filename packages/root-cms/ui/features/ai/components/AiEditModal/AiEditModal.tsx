import './AiEditModal.css';

import {
  IconArrowBackUp,
  IconCheck,
  IconFileDiff,
  IconJson,
} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {useMemo, useCallback} from 'preact/hooks';
import type {Field, Schema} from '../../../../../core/schema.js';
import {JsDiff} from '../../../../components/JsDiff/JsDiff.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {JsonInput} from '../../../../primitives/JsonInput/JsonInput.js';
import type {ContextModalProps} from '../../../../primitives/modals/ModalsProvider.js';
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '../../../../primitives/Tabs/Tabs.js';
import {deserializeDocJson} from '../../../documents/doc.js';
import {AiResponse, ChatPanel} from './ChatPanel.js';
import {AiEditReview, reviewAiEdit} from './reviewAiEdit.js';
import {AI_EDIT_MODAL_ID} from './useAiEditModal.js';

/** Number of validation errors to list in the modal. */
const MAX_ERRORS_SHOWN = 10;

export interface AiEditModalProps {
  [key: string]: unknown;
  title?: string;
  data?: any;
  /** The field `data` belongs to, used to check the AI's proposed value. */
  field?: Field;
  /** The collection's hoisted schemas, needed to check `oneof` values. */
  types?: Record<string, Schema>;
  onSave: (data: any) => void;
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

  // Checks the proposed value against the schema whenever it changes, so
  // problems are shown before the user accepts the change.
  const [review, setReview] = useState<AiEditReview | null>(null);
  useEffect(() => {
    setReview(null);
    if (!parsedValue || !changed || !props.field) {
      return;
    }
    let cancelled = false;
    reviewAiEdit(parsedValue, {
      field: props.field,
      types: props.types,
      before: props.data,
    }).then((result) => {
      if (!cancelled) {
        setReview(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [parsedValue, changed, props.field, props.types, props.data]);

  const errors = review?.errors || [];
  const repairs = review?.repairs || [];
  const reviewPending = Boolean(
    parsedValue && changed && props.field && !review
  );

  const onSave = useCallback(() => {
    if (!parsedValue || reviewPending || errors.length > 0) {
      return;
    }
    const newValue = review ? review.value : deserializeDocJson(parsedValue);
    if (props.onSave) {
      props.onSave(newValue);
    }
  }, [parsedValue, review, reviewPending, errors.length]);

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
                classNames={{
                  input: 'h-full w-full resize-none text-sm leading-normal',
                }}
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
      {errors.length > 0 && (
        <div
          className="AiEditModal__errors mt-4 max-h-40 overflow-auto rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger"
          role="alert"
        >
          <p className="m-0 font-medium">
            This change doesn't match the schema. Ask the AI to fix it, or edit
            the JSON.
          </p>
          <ul className="AiEditModal__errors__list m-0 mt-1 pl-4 font-mono wrap-anywhere">
            {errors.slice(0, MAX_ERRORS_SHOWN).map((error) => (
              <li key={`${error.path}:${error.message}`}>
                {error.path ? `${error.path}: ` : ''}
                {error.message}
              </li>
            ))}
          </ul>
          {errors.length > MAX_ERRORS_SHOWN && (
            <p className="m-0 mt-1">
              And {errors.length - MAX_ERRORS_SHOWN} more.
            </p>
          )}
        </div>
      )}
      {errors.length === 0 && repairs.length > 0 && (
        <p className="AiEditModal__repairs m-0 mt-4 text-sm text-muted">
          {repairs.length} {repairs.length === 1 ? 'value' : 'values'} will be
          auto-corrected to match the schema when saved.
        </p>
      )}
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
          variant="green"
          size="xs"
          type="button"
          disabled={
            !parsedValue || !changed || reviewPending || errors.length > 0
          }
          onClick={onSave}
        >
          Accept changes
        </Button>
      </div>
    </div>
  );
}

AiEditModal.id = AI_EDIT_MODAL_ID;
