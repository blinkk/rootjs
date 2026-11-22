import {
  IconFrame,
  IconHandStop,
  IconMessagePlus,
  IconMinus,
  IconPlus,
  IconPointer,
} from '@tabler/icons-preact';
import {useEffect, useRef} from 'preact/hooks';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import type {PrototypeCanvasTool} from '../PrototypeFrame/PrototypeFrame.js';

/** Props for the bottom-center floating tool and zoom dock. */
export interface PrototypeDockProps {
  /** Currently active canvas tool. */
  tool: PrototypeCanvasTool;
  /** Current zoom scale factor (e.g. `0.48` renders `48%`). */
  zoom: number;
  /** Whether the user can create frames. */
  canEdit: boolean;
  /** Switches active canvas tool. */
  onChangeTool: (tool: PrototypeCanvasTool) => void;
  /** Creates a new frame on the active page. */
  onNewFrame: () => void;
  /** Zooms out one step. */
  onZoomOut: () => void;
  /** Fits all active page frames into the viewport. */
  onFitToScreen: () => void;
  /** Zooms in one step. */
  onZoomIn: () => void;
}

/**
 * Bottom-center floating canvas toolbar providing Select/Pan/New Frame/Comment
 * tools and zoom controls.
 */
export function PrototypeDock(props: PrototypeDockProps) {
  const {
    tool,
    zoom,
    canEdit,
    onChangeTool,
    onNewFrame,
    onZoomOut,
    onFitToScreen,
    onZoomIn,
  } = props;

  const toolbarRef = useRef<HTMLDivElement>(null);

  // Install a roving-tabindex fallback for horizontal `role="toolbar"` only
  // when native `focusgroup` is unsupported, keeping a single tab stop and
  // RTL-aware ArrowLeft/ArrowRight + Home/End navigation across groups.
  useEffect(() => {
    const bar = toolbarRef.current;
    if (!bar || 'focusGroup' in HTMLElement.prototype) {
      return;
    }
    const getToolbarButtons = () =>
      Array.from(
        bar.querySelectorAll<HTMLButtonElement>(
          ':scope > button, :scope > [role="group"] > button'
        )
      );

    const syncInitialTabStops = () => {
      const items = getToolbarButtons();
      if (items.length === 0) {
        return;
      }
      const hasActive = items.some((b) => b.tabIndex === 0);
      if (!hasActive) {
        items.forEach((b, i) => {
          b.tabIndex = i === 0 ? 0 : -1;
        });
      }
    };
    syncInitialTabStops();

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLButtonElement | null;
      const items = getToolbarButtons();
      if (target && items.includes(target)) {
        items.forEach((b) => {
          b.tabIndex = b === target ? 0 : -1;
        });
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLButtonElement | null;
      const items = getToolbarButtons();
      if (!target || !items.includes(target) || items.length === 0) {
        return;
      }
      const rtl = window.getComputedStyle(bar).direction === 'rtl';
      const stepMap: Record<string, number> = {
        ArrowRight: rtl ? -1 : 1,
        ArrowLeft: rtl ? 1 : -1,
      };
      const current = items.indexOf(target);
      let nextIndex = -1;
      if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = items.length - 1;
      } else if (event.key in stepMap) {
        nextIndex =
          (current + stepMap[event.key] + items.length) % items.length;
      }
      if (nextIndex < 0) {
        return;
      }
      event.preventDefault();
      items.forEach((b, i) => {
        b.tabIndex = i === nextIndex ? 0 : -1;
      });
      items[nextIndex].focus();
    };

    bar.addEventListener('focusin', onFocusIn);
    bar.addEventListener('keydown', onKeyDown);
    return () => {
      bar.removeEventListener('focusin', onFocusIn);
      bar.removeEventListener('keydown', onKeyDown);
    };
  }, [canEdit]);

  const zoomPercent = `${Math.round(zoom * 100)}%`;
  const toolToggleClasses =
    'PrototypeDock__toolButton aria-pressed:bg-button-blue-soft aria-pressed:text-button-blue-soft-text aria-pressed:hover:bg-button-blue-soft';

  return (
    <div className="PrototypeDock__wrap pointer-events-none absolute inset-x-2 bottom-3 z-(--cms-z-sticky) flex justify-center">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Canvas tools"
        {...({focusgroup: 'toolbar wrap'} as Record<string, string>)}
        className="PrototypeDock pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-surface px-1.5 py-1 shadow-md"
      >
        <div
          role="group"
          aria-label="Tools"
          className="PrototypeDock__group flex items-center gap-0.5"
        >
          <IconButton
            label="Select (V)"
            size="sm"
            pressed={tool === 'select'}
            className={toolToggleClasses}
            onClick={() => onChangeTool('select')}
          >
            <IconPointer />
          </IconButton>

          <IconButton
            label="Pan (H)"
            size="sm"
            pressed={tool === 'pan'}
            className={toolToggleClasses}
            onClick={() => onChangeTool('pan')}
          >
            <IconHandStop />
          </IconButton>

          <IconButton
            label="New Frame (F)"
            size="sm"
            aria-disabled={!canEdit || undefined}
            className={cn(
              'PrototypeDock__toolButton',
              !canEdit && 'cursor-not-allowed opacity-50'
            )}
            onClick={() => {
              if (!canEdit) {
                return;
              }
              onNewFrame();
            }}
          >
            <IconFrame />
          </IconButton>

          <IconButton
            label="Comment (C)"
            size="sm"
            pressed={tool === 'comment'}
            className={toolToggleClasses}
            onClick={() =>
              onChangeTool(tool === 'comment' ? 'select' : 'comment')
            }
          >
            <IconMessagePlus />
          </IconButton>
        </div>

        <span
          role="separator"
          aria-orientation="vertical"
          className="PrototypeDock__divider mx-1 h-5 w-0 shrink-0 border-l border-border"
        />

        <div
          role="group"
          aria-label="Zoom"
          className="PrototypeDock__group flex items-center gap-0.5"
        >
          <IconButton label="Zoom out (-)" size="sm" onClick={onZoomOut}>
            <IconMinus />
          </IconButton>

          <Tooltip label="Fit to screen (0)">
            <Button
              variant="subtle"
              size="sm"
              className="PrototypeDock__zoomPercent min-w-12 px-1.5 font-mono text-xs tabular-nums text-fg"
              onClick={onFitToScreen}
            >
              {zoomPercent}
            </Button>
          </Tooltip>

          <IconButton label="Zoom in (+)" size="sm" onClick={onZoomIn}>
            <IconPlus />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
