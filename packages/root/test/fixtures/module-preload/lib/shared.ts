/** Shared dep imported by more than one element, so it lands in its own chunk. */
export function renderLabel(el: HTMLElement, label: string) {
  el.textContent = label;
}
