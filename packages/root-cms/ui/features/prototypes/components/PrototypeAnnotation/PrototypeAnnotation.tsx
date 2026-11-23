import {useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks';
import type {PrototypeAnnotation} from '../../../../../shared/prototypes.js';
import {
  PROTOTYPE_LABEL_FONT_SIZE,
  PROTOTYPE_LABEL_MAX_CHARS,
  PROTOTYPE_NOTE_MAX_CHARS,
  PROTOTYPE_NOTE_WIDTH,
} from '../../../../../shared/prototypes.js';
import {cn} from '../../../../utils/classes.js';

/** Screen px the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

/** Props for a note or text label rendered in the canvas world layer. */
export interface PrototypeAnnotationViewProps {
  /** The annotation to render. Its text is always rendered as plain text. */
  annotation: PrototypeAnnotation;
  /** Current canvas zoom, used to keep the selection ring visible. */
  zoom: number;
  /** Whether this annotation is selected. */
  isSelected: boolean;
  /** Whether this annotation's text is being edited. */
  isEditing: boolean;
  /**
   * Whether the user can select, move and edit it. When false it renders as
   * static text and pointer events fall through to the canvas.
   */
  interactive: boolean;
  /** Selects this annotation. */
  onSelect: () => void;
  /** Requests edit mode. */
  onStartEdit: () => void;
  /** Commits edited text. Empty text means "delete this annotation". */
  onCommit: (text: string) => void;
  /** Leaves edit mode without saving. */
  onCancel: () => void;
  /** Reports a drag position; `persist` is true once on drop. */
  onDrag: (x: number, y: number, persist: boolean) => void;
}

/**
 * A sticky note or large text label on the prototype canvas. Editors can
 * drag it, select it, and edit its text in place (double-click or Enter).
 */
export function PrototypeAnnotationView(props: PrototypeAnnotationViewProps) {
  const {annotation, zoom, isSelected, isEditing, interactive} = props;
  const isNote = annotation.kind === 'note';
  const [dragging, setDragging] = useState(false);
  const [draftText, setDraftText] = useState(annotation.text);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  // Set once an edit is committed or cancelled, so the blur that follows the
  // editor unmounting doesn't commit a second time.
  const editDoneRef = useRef(false);
  // True when the edit ended from the keyboard, so focus should return to
  // the annotation. A blur means focus has already moved somewhere else.
  const refocusRef = useRef(false);

  // Focus the editor when edit mode starts, and hand focus back to the
  // annotation when it ends so keyboard users keep their place.
  useEffect(() => {
    if (isEditing) {
      editDoneRef.current = false;
      setDraftText(annotation.text);
      const el = editorRef.current;
      if (el) {
        el.focus({preventScroll: true});
        el.select();
      }
      refocusRef.current = false;
    } else if (refocusRef.current) {
      refocusRef.current = false;
      buttonRef.current?.focus({preventScroll: true});
    }
  }, [isEditing]);

  // Grow the note editor to fit its text.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (isEditing && isNote && el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [isEditing, isNote, draftText]);

  function finishEdit(commit: boolean) {
    if (editDoneRef.current) {
      return;
    }
    editDoneRef.current = true;
    if (commit) {
      props.onCommit(draftText);
    } else {
      props.onCancel();
    }
  }

  function handleEditorKeyDown(e: KeyboardEvent) {
    // Keep canvas shortcuts and dialogs from also reacting to these keys.
    e.stopPropagation();
    if (e.isComposing) {
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      refocusRef.current = true;
      finishEdit(false);
    } else if (e.key === 'Enter' && (!isNote || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      refocusRef.current = true;
      finishEdit(true);
    }
  }

  function handlePointerDown(e: PointerEvent) {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    props.onSelect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = annotation.x;
    const startY = annotation.y;
    let moved = false;

    const position = (event: PointerEvent) => ({
      x: startX + (event.clientX - startClientX) / zoom,
      y: startY + (event.clientY - startClientY) / zoom,
    });
    const onMove = (moveEvent: PointerEvent) => {
      const distance = Math.hypot(
        moveEvent.clientX - startClientX,
        moveEvent.clientY - startClientY
      );
      if (!moved && distance < DRAG_THRESHOLD_PX) {
        return;
      }
      if (!moved) {
        moved = true;
        setDragging(true);
      }
      const next = position(moveEvent);
      props.onDrag(next.x, next.y, false);
    };
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDragging(false);
      if (moved) {
        // A cancelled gesture drops the annotation back where it started.
        const next =
          upEvent.type === 'pointercancel'
            ? {x: startX, y: startY}
            : position(upEvent);
        props.onDrag(next.x, next.y, true);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  const kindLabel = isNote ? 'Note' : 'Label';
  const width = isNote ? annotation.width || PROTOTYPE_NOTE_WIDTH : undefined;
  // World-space sizes shrink with the canvas, so the ring is sized in
  // screen px to stay visible when zoomed out.
  const ring = 2 / Math.max(zoom, 0.05);
  const surfaceClasses = isNote
    ? 'PrototypeAnnotation__surface block w-full rounded-md border border-warning-line bg-warning-soft p-3 text-left font-sans text-base leading-snug font-normal text-fg shadow-sm whitespace-pre-wrap break-words'
    : 'PrototypeAnnotation__surface block rounded-md text-left font-sans leading-tight font-bold whitespace-nowrap text-strong';
  const labelStyle = isNote
    ? undefined
    : {fontSize: `${PROTOTYPE_LABEL_FONT_SIZE}px`};

  return (
    <div
      className={cn(
        'PrototypeAnnotation absolute',
        `PrototypeAnnotation--kind-${annotation.kind}`,
        isEditing ? 'z-40' : 'z-20'
      )}
      style={{
        left: `${annotation.x}px`,
        top: `${annotation.y}px`,
        width: width ? `${width}px` : undefined,
      }}
    >
      {isEditing ? (
        isNote ? (
          <textarea
            ref={editorRef}
            className={cn(
              surfaceClasses,
              'PrototypeAnnotation__editor resize-none overflow-hidden outline-2 outline-focus select-text'
            )}
            style={{outlineWidth: `${ring}px`}}
            aria-label="Note text"
            placeholder="Write a note…"
            rows={2}
            maxLength={PROTOTYPE_NOTE_MAX_CHARS}
            value={draftText}
            onInput={(e) => setDraftText(e.currentTarget.value)}
            onKeyDown={handleEditorKeyDown}
            onBlur={() => finishEdit(true)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <input
            ref={editorRef}
            type="text"
            className={cn(
              surfaceClasses,
              'PrototypeAnnotation__editor bg-surface outline-2 outline-focus select-text'
            )}
            style={{
              ...labelStyle,
              outlineWidth: `${ring}px`,
              width: `${Math.max(6, draftText.length + 2)}ch`,
            }}
            aria-label="Label text"
            placeholder="Label"
            maxLength={PROTOTYPE_LABEL_MAX_CHARS}
            value={draftText}
            onInput={(e) => setDraftText(e.currentTarget.value)}
            onKeyDown={handleEditorKeyDown}
            onBlur={() => finishEdit(true)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )
      ) : interactive ? (
        <button
          ref={buttonRef}
          type="button"
          className={cn(
            surfaceClasses,
            'PrototypeAnnotation__button outline-focus',
            dragging ? 'cursor-grabbing' : 'cursor-grab'
          )}
          style={{
            ...labelStyle,
            outlineStyle: isSelected ? 'solid' : undefined,
            outlineWidth: isSelected ? `${ring}px` : undefined,
            outlineOffset: isSelected ? `${ring}px` : undefined,
          }}
          aria-label={`${kindLabel}: ${annotation.text}`}
          aria-pressed={isSelected}
          aria-description="Press Enter to edit, Delete to remove."
          onPointerDown={handlePointerDown}
          onFocus={() => {
            // Keyboard focus selects, so the ring and Delete follow focus.
            if (!isSelected) {
              props.onSelect();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onDblClick={(e) => {
            e.stopPropagation();
            props.onStartEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.repeat) {
              e.preventDefault();
              e.stopPropagation();
              props.onStartEdit();
            }
          }}
        >
          {annotation.text}
        </button>
      ) : (
        <div className={surfaceClasses} style={labelStyle}>
          {annotation.text}
        </div>
      )}
    </div>
  );
}
