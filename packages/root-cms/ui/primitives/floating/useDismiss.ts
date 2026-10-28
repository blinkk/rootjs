import {useEffect, useRef} from 'preact/hooks';

/** Why an overlay was dismissed. */
export type DismissReason = 'escape' | 'outside';

export interface UseDismissOptions {
  /** Whether the overlay is open. Only open overlays are dismissable. */
  open: boolean;
  /**
   * Elements that count as "inside" the overlay, usually the trigger and the
   * floating element. Presses on them don't dismiss it.
   */
  elements: Array<unknown>;
  /** Called with the reason when the overlay should close. */
  onDismiss: (reason: DismissReason) => void;
  /** Close when Escape is pressed. Default `true`. */
  escape?: boolean;
  /** Close on a pointer press outside `elements`. Default `true`. */
  outsidePress?: boolean;
}

interface Layer {
  options: UseDismissOptions;
}

/** Open overlays, in the order they opened; the last one is on top. */
const layers: Layer[] = [];

function contains(layer: Layer, target: Node) {
  return layer.options.elements.some(
    (el) => el instanceof Node && el.contains(target)
  );
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.isComposing) {
    return;
  }
  const top = layers[layers.length - 1];
  if (!top || top.options.escape === false) {
    return;
  }
  // Keep the key from also closing a parent dialog or overlay.
  e.preventDefault();
  e.stopPropagation();
  top.options.onDismiss('escape');
}

function onPointerDown(e: PointerEvent) {
  const target = e.target;
  if (!(target instanceof Node)) {
    return;
  }
  // Close each overlay the press is outside of, from the top down, and stop
  // at the first one it's inside: pressing a nested menu keeps its parent
  // popover open.
  for (const layer of [...layers].reverse()) {
    if (contains(layer, target)) {
      break;
    }
    if (layer.options.outsidePress !== false) {
      layer.options.onDismiss('outside');
    }
  }
}

function addLayer(layer: Layer) {
  if (layers.length === 0) {
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
  }
  layers.push(layer);
}

function removeLayer(layer: Layer) {
  const index = layers.indexOf(layer);
  if (index !== -1) {
    layers.splice(index, 1);
  }
  if (layers.length === 0) {
    window.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
  }
}

/**
 * Closes an overlay on Escape or on a press outside it. Open overlays form a
 * stack, so with nested overlays (a menu inside a popover) Escape closes only
 * the topmost one, and a press inside a child overlay doesn't close its
 * parent.
 *
 * ```tsx
 * useDismiss({
 *   open,
 *   elements: [reference, floating],
 *   onDismiss: (reason) => setOpen(false),
 * });
 * ```
 */
export function useDismiss(options: UseDismissOptions) {
  const layerRef = useRef<Layer>({options});
  layerRef.current.options = options;

  useEffect(() => {
    if (!options.open) {
      return undefined;
    }
    const layer = layerRef.current;
    addLayer(layer);
    return () => removeLayer(layer);
  }, [options.open]);
}
