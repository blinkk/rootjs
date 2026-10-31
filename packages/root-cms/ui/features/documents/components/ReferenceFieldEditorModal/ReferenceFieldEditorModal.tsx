import {IconArrowUpRight} from '@tabler/icons-preact';
import {Button} from '../../../../primitives/Button/Button.js';
import {DialogFooter} from '../../../../primitives/Dialog/Dialog.js';
import type {ContextModalProps} from '../../../../primitives/modals/ModalsProvider.js';
import {DraftDocProvider, useDraftDoc} from '../../useDraftDoc.js';
import {DocEditor} from '../DocEditor/DocEditor.js';
import {REFERENCE_FIELD_EDITOR_MODAL_ID} from './useReferenceFieldEditorModal.js';

export interface ReferenceFieldEditorModalProps {
  [key: string]: unknown;
  docId: string;
}

/**
 * Modal for quickly editing a referenced doc and persisting changes on save.
 */
export function ReferenceFieldEditorModal(
  modalProps: ContextModalProps<ReferenceFieldEditorModalProps>
) {
  const {id, context, innerProps} = modalProps;
  const docId = innerProps.docId;
  return (
    <div className="ReferenceFieldEditorModal">
      <DraftDocProvider docId={docId} autoSave={false} flushOnStop={false}>
        <DocEditor
          className="ReferenceFieldEditorModal__DocEditor pb-15"
          docId={innerProps.docId}
          hideStatusBar
        />
        <ReferenceFieldEditorModal.Footer
          docId={docId}
          onCancel={() => context.closeModal(id)}
        />
      </DraftDocProvider>
    </div>
  );
}

/**
 * The modal's actions, pinned in the dialog's footer. Rendered inside the
 * `DraftDocProvider` so Save can flush the draft.
 */
ReferenceFieldEditorModal.Footer = (props: {
  docId: string;
  onCancel: () => void;
}) => {
  const draft = useDraftDoc();

  return (
    <DialogFooter>
      <div className="ReferenceFieldEditorModal__footer flex w-full flex-wrap items-center justify-end gap-3">
        <div className="ReferenceFieldEditorModal__footer__start min-w-0 flex-1">
          <Button
            href={`/cms/content/${props.docId}`}
            target="_blank"
            iconRight={<IconArrowUpRight />}
            className="max-w-full"
          >
            Open {props.docId}
          </Button>
        </div>
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button
          variant="primary"
          onClick={async () => {
            await draft.controller.flush();
            props.onCancel();
          }}
        >
          Save
        </Button>
      </div>
    </DialogFooter>
  );
};

ReferenceFieldEditorModal.id = REFERENCE_FIELD_EDITOR_MODAL_ID;
