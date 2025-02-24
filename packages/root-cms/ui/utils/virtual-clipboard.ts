export class VirtualClipboard {
  value: any = null;

  set(value: string) {
    this.value = value;
  }
}

const globalVirtualClipboard = new VirtualClipboard();

/**
 * Hook that returns a virtual clipboard for storing a saved value and allows
 * for pasting it elsewhere.
 *
 * NOTE(stevenle): this currently uses a global singleton so that the clipboard
 * value can be preserved as the user navigates different parts of the UI.
 */
export function useVirtualClipboard() {
  return globalVirtualClipboard;
}
