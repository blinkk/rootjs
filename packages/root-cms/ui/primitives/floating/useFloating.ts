import {
  arrow,
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
  type Middleware,
  type Placement,
  type ReferenceElement,
} from '@floating-ui/dom';
import {useCallback, useLayoutEffect, useState} from 'preact/hooks';

export type {Placement, ReferenceElement};

export interface UseFloatingOptions {
  /** Whether the floating element is shown. Positioning only runs while open. */
  open: boolean;
  /**
   * Preferred side and alignment, e.g. `bottom`, `bottom-start`, `top-end`
   * or `right`. It flips to the other side, or to a perpendicular one, when
   * there isn't room. Default `bottom`.
   */
  placement?: Placement;
  /** Gap between the reference and the floating element, in px. Default 4. */
  offset?: number;
  /** Minimum distance from the viewport edges, in px. Default 8. */
  padding?: number;
  /**
   * Sizes the floating element from the reference's width: `min` makes it at
   * least as wide (e.g. a select's dropdown), `equal` exactly as wide.
   * Default `false`.
   */
  matchReferenceWidth?: false | 'min' | 'equal';
  /**
   * Caps the floating element's height, in px, below the space available.
   * (A class can't do it: the available height is set inline.)
   */
  maxHeight?: number;
}

export interface UseFloatingResult {
  /** Callback ref for the element (or virtual element) to anchor to. */
  setReference: (el: ReferenceElement | null) => void;
  /** Callback ref for the floating element. */
  setFloating: (el: HTMLElement | null) => void;
  /** Optional callback ref for an arrow inside the floating element. */
  setArrow: (el: HTMLElement | null) => void;
  /** The current reference element, once mounted. */
  reference: ReferenceElement | null;
  /** The current floating element, once mounted. */
  floating: HTMLElement | null;
  /** Where the floating element ended up, after flipping. */
  placement: Placement;
  /** Recomputes the position immediately. */
  update: () => void;
}

/** The side opposite each placement side, where an arrow attaches. */
const ARROW_SIDE = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
} as const;

/**
 * Positions a floating element (tooltip, popover, menu, select dropdown)
 * next to a reference element with `@floating-ui/dom`, and keeps it there
 * while the page scrolls or either element resizes.
 *
 * The floating element is `position: fixed`, flips to another side when its
 * preferred one doesn't fit, shifts to stay on screen, and gets a
 * `max-width`/`max-height` of the space available, so it always fits the
 * viewport (375px phones included). Give it `overflow-auto` if its content
 * can be taller than the screen, and `w-max` so it sizes to its content
 * rather than to the space left of its `left` position.
 *
 * The hook owns these inline styles on the floating element: `position`,
 * `left`, `top`, `max-width`, `max-height` (and `width`/`min-width` with
 * `matchReferenceWidth`). On the arrow it owns `left`, `top` and the side it
 * attaches to. It also sets `data-placement` on the floating element. Don't
 * set those yourself; style the elements with classes.
 *
 * ```tsx
 * const {setReference, setFloating} = useFloating({open, placement: 'top'});
 * return (
 *   <>
 *     <button ref={setReference}>Trigger</button>
 *     {open && (
 *       <Portal>
 *         <div ref={setFloating} className="w-max bg-surface shadow-md">…</div>
 *       </Portal>
 *     )}
 *   </>
 * );
 * ```
 */
export function useFloating(options: UseFloatingOptions): UseFloatingResult {
  const {
    open,
    placement = 'bottom',
    offset: offsetPx = 4,
    padding = 8,
    matchReferenceWidth = false,
    maxHeight,
  } = options;
  const [reference, setReferenceState] = useState<ReferenceElement | null>(
    null
  );
  const [floating, setFloating] = useState<HTMLElement | null>(null);
  const [arrowEl, setArrow] = useState<HTMLElement | null>(null);
  const [resolvedPlacement, setResolvedPlacement] =
    useState<Placement>(placement);

  // Refs to non-DOM values (e.g. a component instance, when a trigger
  // doesn't forward its ref) are ignored.
  const setReference = useCallback((el: ReferenceElement | null) => {
    setReferenceState(
      el && typeof el.getBoundingClientRect === 'function' ? el : null
    );
  }, []);

  const update = useCallback(() => {
    if (!reference || !floating) {
      return;
    }
    const middleware: Middleware[] = [
      offset(offsetPx),
      // `shift` handles overflow along the side, so only overflow away from
      // the side (or a start/end alignment) is a reason to flip.
      flip({
        padding,
        crossAxis: 'alignment',
        fallbackAxisSideDirection: 'end',
      }),
      shift({padding}),
      size({
        padding,
        apply({availableWidth, availableHeight, rects, elements}) {
          const style = elements.floating.style;
          style.maxWidth = `${Math.max(0, availableWidth)}px`;
          const height = Math.max(0, availableHeight);
          style.maxHeight = `${maxHeight === undefined ? height : Math.min(height, maxHeight)}px`;
          if (matchReferenceWidth === 'min') {
            style.minWidth = `${rects.reference.width}px`;
          } else if (matchReferenceWidth === 'equal') {
            style.width = `${rects.reference.width}px`;
          }
        },
      }),
    ];
    if (arrowEl) {
      middleware.push(arrow({element: arrowEl, padding: 4}));
    }
    computePosition(reference, floating, {
      strategy: 'fixed',
      placement,
      middleware,
    }).then((result) => {
      Object.assign(floating.style, {
        left: `${result.x}px`,
        top: `${result.y}px`,
      });
      floating.dataset.placement = result.placement;
      setResolvedPlacement(result.placement);

      const arrowData = result.middlewareData.arrow;
      if (arrowEl && arrowData) {
        const side = result.placement.split('-')[0] as keyof typeof ARROW_SIDE;
        Object.assign(arrowEl.style, {
          left: arrowData.x !== undefined ? `${arrowData.x}px` : '',
          top: arrowData.y !== undefined ? `${arrowData.y}px` : '',
          right: '',
          bottom: '',
          [ARROW_SIDE[side]]: `${-arrowEl.offsetWidth / 2}px`,
        });
      }
    });
  }, [
    reference,
    floating,
    arrowEl,
    placement,
    offsetPx,
    padding,
    matchReferenceWidth,
    maxHeight,
  ]);

  // A layout effect, so the first position is computed before the browser
  // paints the floating element in the top-left corner.
  useLayoutEffect(() => {
    if (!open || !reference || !floating) {
      return undefined;
    }
    floating.style.position = 'fixed';
    if (!floating.style.left) {
      Object.assign(floating.style, {left: '0', top: '0'});
    }
    return autoUpdate(reference, floating, update);
  }, [open, reference, floating, update]);

  return {
    setReference,
    setFloating,
    setArrow,
    reference,
    floating,
    placement: resolvedPlacement,
    update,
  };
}
