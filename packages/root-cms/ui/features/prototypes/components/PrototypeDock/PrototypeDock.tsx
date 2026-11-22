import {
  IconComponents,
  IconFrame,
  IconHandStop,
  IconMessagePlus,
  IconMinus,
  IconPlus,
  IconPointer,
  IconSearch,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import type {
  PrototypeBlock,
  PrototypeComponentSpec,
  SiteSchemaSummary,
} from '../../../../../shared/prototypes.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Popover} from '../../../../primitives/Popover/Popover.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {buildFallbackBlockHtml} from '../../usePrototypeBoard.js';
import type {PrototypeCanvasTool} from '../PrototypeFrame/PrototypeFrame.js';

/** Props for the bottom-center floating tool and zoom dock. */
export interface PrototypeDockProps {
  /** Currently active canvas tool. */
  tool: PrototypeCanvasTool;
  /** Current zoom scale factor (e.g. `0.48` renders `48%`). */
  zoom: number;
  /** Whether the user can create frames and insert components. */
  canEdit: boolean;
  /** Reusable component specs on the board (Visual Twins + Proposed specs). */
  boardComponents: Record<string, PrototypeComponentSpec>;
  /** Existing project schemas discovered from `/cms/api/prototypes.context`. */
  siteSchemas: SiteSchemaSummary[];
  /** Switches active canvas tool. */
  onChangeTool: (tool: PrototypeCanvasTool) => void;
  /** Creates a new frame on the active page. */
  onNewFrame: () => void;
  /** Inserts a component block into the selected frame (or a new frame). */
  onInsertComponent: (block: PrototypeBlock) => void;
  /** Zooms out one step. */
  onZoomOut: () => void;
  /** Fits all active page frames into the viewport. */
  onFitToScreen: () => void;
  /** Zooms in one step. */
  onZoomIn: () => void;
}

/** Unified entry shown in the Components picker popover. */
interface ComponentPickerEntry {
  name: string;
  label: string;
  description?: string;
  proposed: boolean;
  html: string;
  css?: string;
}

/**
 * Bottom-center floating canvas toolbar providing Select/Pan/New Frame/Comment
 * tools, a 1-click Components insert popover, and zoom controls.
 */
export function PrototypeDock(props: PrototypeDockProps) {
  const {
    tool,
    zoom,
    canEdit,
    boardComponents,
    siteSchemas,
    onChangeTool,
    onNewFrame,
    onInsertComponent,
    onZoomOut,
    onFitToScreen,
    onZoomIn,
  } = props;

  const [componentsOpen, setComponentsOpen] = useState(false);
  const [search, setSearch] = useState('');
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

  const {proposedEntries, existingEntries} = useMemo(() => {
    const proposed: ComponentPickerEntry[] = [];
    const existing: ComponentPickerEntry[] = [];
    const seen = new Set<string>();

    // Board proposed components come first.
    for (const spec of Object.values(boardComponents)) {
      if (spec.origin === 'proposed') {
        seen.add(spec.name);
        proposed.push({
          name: spec.name,
          label: spec.label || spec.name,
          description: spec.description || spec.rationale,
          proposed: true,
          html: spec.defaultHtml,
          css: spec.css,
        });
      }
    }

    // Existing site schemas (upgraded with cached Visual Twin HTML if available).
    for (const schema of siteSchemas) {
      if (seen.has(schema.name)) {
        continue;
      }
      seen.add(schema.name);
      const twin = boardComponents[schema.name];
      existing.push({
        name: schema.name,
        label: twin?.label || schema.label || schema.name,
        description: twin?.description || schema.description,
        proposed: false,
        html: twin?.defaultHtml || buildFallbackBlockHtml(schema),
        css: twin?.css,
      });
    }

    // Include any cached existing Visual Twins not present in siteSchemas.
    for (const spec of Object.values(boardComponents)) {
      if (spec.origin !== 'proposed' && !seen.has(spec.name)) {
        seen.add(spec.name);
        existing.push({
          name: spec.name,
          label: spec.label || spec.name,
          description: spec.description,
          proposed: false,
          html: spec.defaultHtml,
          css: spec.css,
        });
      }
    }

    proposed.sort((a, b) => a.label.localeCompare(b.label));
    existing.sort((a, b) => a.label.localeCompare(b.label));
    return {proposedEntries: proposed, existingEntries: existing};
  }, [boardComponents, siteSchemas]);

  const query = search.trim().toLowerCase();
  const filteredProposed = useMemo(
    () =>
      query
        ? proposedEntries.filter(
            (entry) =>
              entry.label.toLowerCase().includes(query) ||
              entry.name.toLowerCase().includes(query) ||
              (entry.description || '').toLowerCase().includes(query)
          )
        : proposedEntries,
    [proposedEntries, query]
  );

  const filteredExisting = useMemo(
    () =>
      query
        ? existingEntries.filter(
            (entry) =>
              entry.label.toLowerCase().includes(query) ||
              entry.name.toLowerCase().includes(query) ||
              (entry.description || '').toLowerCase().includes(query)
          )
        : existingEntries,
    [existingEntries, query]
  );

  function handlePickComponent(entry: ComponentPickerEntry) {
    onInsertComponent({
      component: entry.name,
      label: entry.label,
      proposed: entry.proposed || undefined,
      html: entry.html,
      css: entry.css,
    });
    setComponentsOpen(false);
  }

  const zoomPercent = `${Math.round(zoom * 100)}%`;

  const toolToggleClasses =
    'PrototypeDock__toolButton aria-pressed:bg-button-blue-soft aria-pressed:text-button-blue-soft-text aria-pressed:hover:bg-button-blue-soft';

  return (
    <div className="PrototypeDock__wrap pointer-events-none fixed inset-x-2 bottom-3 z-(--cms-z-sticky) flex justify-center">
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

          {canEdit && (
            <Popover
              placement="top"
              width={300}
              label="Insert component"
              open={componentsOpen}
              onOpenChange={(next) => {
                setComponentsOpen(next);
                if (!next) {
                  setSearch('');
                }
              }}
              className="PrototypeDock__componentsPopover p-0"
              trigger={
                <Button
                  variant="subtle"
                  size="sm"
                  className="PrototypeDock__componentsButton max-sm:gap-0 max-sm:px-2"
                  icon={<IconComponents />}
                  aria-label="Components"
                >
                  <span className="hidden sm:inline">Components</span>
                </Button>
              }
            >
              <div className="PrototypeDock__componentsPanel flex max-h-80 flex-col">
                <div className="border-b border-border p-2">
                  <TextInput
                    size="xs"
                    aria-label="Filter components"
                    placeholder="Filter components…"
                    leftSection={<IconSearch />}
                    value={search}
                    onInput={(e) => setSearch(e.currentTarget.value)}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-1.5">
                  {filteredProposed.length > 0 && (
                    <div className="PrototypeDock__componentsGroup flex flex-col gap-0.5">
                      <div className="px-2 py-1 text-xs font-semibold text-muted">
                        Proposed components
                      </div>
                      {filteredProposed.map((entry) => (
                        <button
                          key={entry.name}
                          type="button"
                          className="PrototypeDock__componentItem flex w-full cursor-pointer flex-col gap-0.5 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left font-sans hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                          onClick={() => handlePickComponent(entry)}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-strong">
                              {entry.label}
                            </span>
                            <Badge tone="violet" size="xs">
                              Proposed
                            </Badge>
                          </div>
                          {entry.description && (
                            <span className="line-clamp-1 text-xs text-muted">
                              {entry.description}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {filteredExisting.length > 0 && (
                    <div className="PrototypeDock__componentsGroup flex flex-col gap-0.5">
                      <div className="px-2 py-1 text-xs font-semibold text-muted">
                        Site components
                      </div>
                      {filteredExisting.map((entry) => (
                        <button
                          key={entry.name}
                          type="button"
                          className="PrototypeDock__componentItem flex w-full cursor-pointer flex-col gap-0.5 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left font-sans hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                          onClick={() => handlePickComponent(entry)}
                        >
                          <span className="truncate text-sm font-medium text-strong">
                            {entry.label}
                          </span>
                          {entry.description && (
                            <span className="line-clamp-1 text-xs text-muted">
                              {entry.description}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {filteredProposed.length === 0 &&
                    filteredExisting.length === 0 && (
                      <div className="px-3 py-6 text-center text-sm text-muted">
                        {query
                          ? 'No components match your filter.'
                          : 'No site schemas found. Ask Root AI to generate a block.'}
                      </div>
                    )}
                </div>
              </div>
            </Popover>
          )}
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
