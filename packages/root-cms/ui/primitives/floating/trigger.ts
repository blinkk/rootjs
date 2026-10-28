import type {Ref, VNode} from 'preact';
import {cloneElement} from 'preact/compat';

/** The `ref` a caller set on a trigger element, if any. */
export function getElementRef<T = Element>(el: VNode<any>): Ref<T> | undefined {
  return (el as unknown as {ref?: Ref<T>}).ref ?? undefined;
}

/**
 * Clones an overlay's trigger element with extra props. Event handlers
 * (`on*`) are chained after the trigger's own instead of replacing them.
 * Pass a `ref` made with `useMergedRef(getElementRef(trigger), …)`, so the
 * trigger's own ref keeps working.
 *
 * The trigger must be a single element that renders a focusable DOM element
 * and forwards its `ref` and props to it: a `<button>`, `Button`,
 * `IconButton`, or a `Tooltip` wrapping one of those.
 */
export function cloneTrigger(
  trigger: VNode<any>,
  props: Record<string, unknown>
): VNode<any> {
  const own = trigger.props as Record<string, unknown>;
  const merged: Record<string, unknown> = {...props};
  for (const [key, value] of Object.entries(props)) {
    const ownValue = own[key];
    if (
      /^on[A-Z]/.test(key) &&
      typeof value === 'function' &&
      typeof ownValue === 'function'
    ) {
      merged[key] = (e: Event) => {
        ownValue(e);
        value(e);
      };
    }
  }
  return cloneElement(trigger, merged);
}
