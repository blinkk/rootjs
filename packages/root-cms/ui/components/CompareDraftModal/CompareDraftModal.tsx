import './CompareDraftModal.css';

import {ContextModalProps, useModals} from '@mantine/modals';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {DocDiffViewer} from '../DocDiffViewer/DocDiffViewer.js';

const MODAL_ID = 'CompareDraftModal';

export interface CompareDraftModalProps {
  [key: string]: unknown;
  docId: string;
}

export function useCompareDraftModal(props: CompareDraftModalProps) {
  // Degrade gracefully when rendered outside a `ModalsProvider` (e.g. visual
  // tests that render badges in isolation).
  let modals: ReturnType<typeof useModals> | null = null;
  try {
    modals = useModals();
  } catch {
    modals = null;
  }
  const modalTheme = useModalTheme();
  return {
    enabled: modals !== null,
    open: () => {
      if (!modals) {
        console.warn(
          'useCompareDraftModal() requires a <ModalsProvider> context.'
        );
        return;
      }
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title: `Unpublished changes: ${props.docId}`,
        innerProps: props,
        overflow: 'inside',
        size: 'min(calc(100% - 32px), 900px)',
      });
    },
  };
}

export function CompareDraftModal(
  modalProps: ContextModalProps<CompareDraftModalProps>
) {
  const {innerProps: props} = modalProps;
  const docId = props.docId;
  return (
    <div className="CompareDraftModal">
      <DocDiffViewer
        className="CompareDraftModal__diff"
        left={{docId, versionId: 'published'}}
        right={{docId, versionId: 'draft'}}
        showExpandButton={true}
        showAiSummary={false}
      />
    </div>
  );
}

CompareDraftModal.id = MODAL_ID;
