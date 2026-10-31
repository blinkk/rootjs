import type {ContextModalProps} from '../../../../primitives/modals/ModalsProvider.js';
import {DocDiffViewer} from '../DocDiffViewer/DocDiffViewer.js';
import {COMPARE_DRAFT_MODAL_ID} from './useCompareDraftModal.js';

export interface CompareDraftModalProps {
  [key: string]: unknown;
  docId: string;
}

export function CompareDraftModal(
  modalProps: ContextModalProps<CompareDraftModalProps>
) {
  const {innerProps: props} = modalProps;
  const docId = props.docId;
  return (
    <div className="CompareDraftModal">
      <DocDiffViewer
        className="CompareDraftModal__diff mt-1"
        left={{docId, versionId: 'published'}}
        right={{docId, versionId: 'draft'}}
        showExpandButton={true}
        showAiSummary={false}
      />
    </div>
  );
}

CompareDraftModal.id = COMPARE_DRAFT_MODAL_ID;
