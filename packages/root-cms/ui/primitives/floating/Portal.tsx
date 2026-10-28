import type {ComponentChildren} from 'preact';
import {createContext} from 'preact';
import {createPortal} from 'preact/compat';
import {useContext, useState} from 'preact/hooks';
import {cn} from '../../utils/classes.js';
import {useOverlayRoot} from '../Dialog/dialogStack.js';

/**
 * Overrides where overlays inside a subtree portal to. Set it with
 * `PortalContainer`.
 */
const PortalContainerContext = createContext<Element | null>(null);

export interface PortalProps {
  children: ComponentChildren;
  /**
   * Where to render. Default: the topmost open modal `<dialog>`, else the
   * nearest `PortalContainer`, else `document.body` (see
   * `usePortalContainer()`).
   */
  container?: Element | null;
}

/**
 * Renders its children outside the component's DOM position, out of any
 * parent that clips or stacks them (`overflow: hidden`, `z-index`): into the
 * topmost open modal `<dialog>` when one is open, else at the end of
 * `document.body`. Preact uses native events, so events from portaled
 * content bubble through the DOM, not through the component tree.
 *
 * ```tsx
 * {open && (
 *   <Portal>
 *     <div className="Menu">…</div>
 *   </Portal>
 * )}
 * ```
 */
export function Portal(props: PortalProps) {
  const defaultContainer = usePortalContainer();
  return createPortal(
    props.children as any,
    props.container ?? defaultContainer
  ) as any;
}

/**
 * The element overlays portal into by default:
 *
 * 1. the topmost open modal `<dialog>` (`useOverlayRoot()`). A modal dialog
 *    makes the rest of the page inert and sits in the browser's top layer,
 *    above every `z-index`, so an overlay portaled anywhere else would be
 *    hidden behind it and unclickable;
 * 2. else the nearest `PortalContainer`;
 * 3. else `document.body`.
 *
 * Re-renders when a dialog opens or closes.
 */
export function usePortalContainer(): Element {
  const overlayRoot = useOverlayRoot();
  const contextContainer = useContext(PortalContainerContext);
  if (overlayRoot !== document.body) {
    return overlayRoot;
  }
  return contextContainer ?? document.body;
}

export interface PortalContainerProps {
  children: ComponentChildren;
  className?: string;
}

/**
 * Makes overlays (tooltips, popovers, menus) opened inside it render into
 * it, instead of at the end of `document.body`. It renders a
 * `display: contents` div, so it doesn't affect layout. Use it where the
 * overlays must stay inside a region of the page: an embedded widget, a
 * shadow root, or a gallery story's landmark.
 *
 * ```tsx
 * <PortalContainer>
 *   <Menu trigger={…}>…</Menu>
 * </PortalContainer>
 * ```
 */
export function PortalContainer(props: PortalContainerProps) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  return (
    <PortalContainerContext.Provider value={el}>
      <div
        ref={setEl}
        className={cn('PortalContainer contents', props.className)}
      >
        {props.children}
      </div>
    </PortalContainerContext.Provider>
  );
}
