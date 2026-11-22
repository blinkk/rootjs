import type {
  PrototypeBoardBundle,
  PrototypeComponentSpec,
  PrototypeFrame,
  PrototypeTurnSnapshot,
} from '../../../../shared/prototypes.js';

/** Props for the floating Root AI prototyping assistant card. */
export interface PrototypeAiCardProps {
  /** Hydrated prototype board state. */
  bundle: PrototypeBoardBundle;
  /** Active page id on the board. */
  activePageId: string;
  /** Currently selected frame id, if any. */
  selectedFrameId: string | null;
  /** Currently selected block key within `selectedFrameId`, if any. */
  selectedBlockKey: string | null;
  /** Optional external prompt queued from another UI control (e.g. Comments). */
  queuedPrompt?: {id: string | number; text: string} | null;
  /** Invoked to clear a single context selection chip (`frame` or `block`). */
  onClearContext?: (kind: 'frame' | 'block') => void;
  /** Invoked when AI creates/updates a frame so optimistic UI & selection stay in sync. */
  onFrameMutated?: (frame: PrototypeFrame) => void;
  /** Invoked when AI proposes/updates a component spec. */
  onComponentMutated?: (spec: PrototypeComponentSpec) => void;
  /** Invoked when an AI turn snapshot is saved or reverted. */
  onTurnMutated?: (turn?: PrototypeTurnSnapshot) => void;
  /** Invoked when the user closes the floating Root AI card. */
  onClose: () => void;
}

/**
 * Placeholder shell replaced by the `ai-partner` worker.
 */
export function PrototypeAiCard(props: PrototypeAiCardProps) {
  return (
    <aside aria-label="Root AI" className="PrototypeAiCard">
      <button type="button" onClick={props.onClose}>
        Close
      </button>
    </aside>
  );
}
