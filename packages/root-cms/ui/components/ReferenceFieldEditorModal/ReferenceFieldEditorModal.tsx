import './ReferenceFieldEditorModal.css';

import {ActionIcon, Button, Tooltip} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {IconArrowUpRight} from '@tabler/icons-preact';
import {DraftDocProvider, useDraftDoc} from '../../hooks/useDraftDoc.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {DocEditor} from '../DocEditor/DocEditor.js';

const MODAL_ID = 'ReferenceFieldEditorModal';

export interface ReferenceFieldEditorModalProps {
  [key: string]: unknown;
  docId: string;
}

export function useReferenceFieldEditorModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: ReferenceFieldEditorModalProps) => {
      modals.openContextModal<ReferenceFieldEditorModalProps>(MODAL_ID, {
        ...modalTheme,
        className: 'ReferenceFieldEditorModalWrap',
        innerProps: props,
        title: <ReferenceFieldEditorModal.Header docId={props.docId} />,
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
        <DocEditor
          className="ReferenceFieldEditorModal__DocEditor"
          docId={innerProps.docId}
          hideStatusBar
        />
        <ReferenceFieldEditorModal.Footer
          onCancel={() => context.closeModal(id)}
        />
      </DraftDocProvider>
    </div>
  );
}

ReferenceFieldEditorModal.Header = (props: {docId: string}) => {
  const docUrl = `/cms/content/${props.docId}`;
  return (
    <div className="ReferenceFieldEditorModal__header">
      <div className="ReferenceFieldEditorModal__header__title">
        Edit {props.docId}
      </div>
      <Button
        component="a"
        href={docUrl}
        target="_blank"
        variant="default"
        compact
        size="xs"
        tabindex="-1"
      >
        open in new tab
      </Button>
    </div>
  );
};

ReferenceFieldEditorModal.Footer = (props: {onCancel: () => void}) => {
  const draft = useDraftDoc();

  return (
    <div className="ReferenceFieldEditorModal__footer">
      <Button variant="default" size="xs" onClick={props.onCancel}>
        Cancel
      </Button>
      <Button
        color="dark"
        size="xs"
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
