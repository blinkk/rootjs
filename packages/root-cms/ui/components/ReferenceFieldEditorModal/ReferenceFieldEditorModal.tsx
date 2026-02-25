import './ReferenceFieldEditorModal.css';

import {Button} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {DraftDocProvider, useDraftDoc} from '../../hooks/useDraftDoc.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {DocEditor} from '../DocEditor/DocEditor.js';

const MODAL_ID = 'ReferenceFieldEditorModal';

export interface ReferenceFieldEditorModalProps {
  docId: string;
}

export function useReferenceFieldEditorModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: ReferenceFieldEditorModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
        size: 'xl',
        overflow: 'inside',
        closeOnClickOutside: false,
        closeOnEscape: false,
      });
    },
  };
}

/**
 * Modal for quickly editing a referenced doc and persisting changes on save.
 */
export function ReferenceFieldEditorModal(
  modalProps: ContextModalProps<ReferenceFieldEditorModalProps>
) {
  const {id, context, innerProps} = modalProps;
  return (
    <div className="ReferenceFieldEditorModal">
      <DraftDocProvider
        docId={innerProps.docId}
        autoSave={false}
        flushOnStop={false}
      >
        <DocEditor docId={innerProps.docId} hideStatusBar />
        <ReferenceFieldEditorModal.Footer
          onCancel={() => context.closeModal(id)}
        />
      </DraftDocProvider>
    </div>
  );
}

ReferenceFieldEditorModal.Footer = (props: {onCancel: () => void}) => {
  const draft = useDraftDoc();

  return (
    <div className="ReferenceFieldEditorModal__footer">
      <Button variant="default" onClick={props.onCancel}>
        Cancel
      </Button>
      <Button
        color="dark"
        onClick={async () => {
          await draft.controller.flush();
          props.onCancel();
        }}
      >
        Save
      </Button>
    </div>
  );
};

ReferenceFieldEditorModal.id = MODAL_ID;
