import {ComponentChildren, createContext} from 'preact';
import {useContext} from 'preact/hooks';

/**
 * JSON data that can be read/write in the virtual clipboard. Null data
 * indicates there's no content (it's either empty, or the navigator clipboard
 * has no JSON).
 */
export type ClipboardData = Record<string, any> | null;

export interface VirtualClipboard {
  /** Returns the clipboard data as JSON (or null, if empty or unavailable). */
  get: () => Promise<ClipboardData>;
  /** Sets JSON data to the clipboard. */
  set: (value: ClipboardData) => void;
}

/** The virtual clipboard is a simple wrapper around the navigator clipboard that normalizes access to JSON data. */
const VirtualClipboardContext = createContext<VirtualClipboard | null>(null);

export function VirtualClipboardProvider(props: {
  children?: ComponentChildren;
}) {
  const virtualClipboard: VirtualClipboard = {
    get: async () => {
      try {
        const text = await getNavigatorClipboardText();
        return text ? JSON.parse(text) : null;
      } catch (error) {
        return null;
      }
    },
    set: (value) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(JSON.stringify(value, undefined, 2))
          .catch(console.error);
      }
    },
  };

  return (
    <VirtualClipboardContext.Provider value={virtualClipboard}>
      {props.children}
    </VirtualClipboardContext.Provider>
  );
}

export function useVirtualClipboard(): VirtualClipboard {
  const virtualClipboard = useContext(VirtualClipboardContext);
  if (!virtualClipboard) {
    throw new Error(
      'virtualClipboard is null, make sure to add <VirtualClipboardProvider>'
    );
  }
  return virtualClipboard;
}

async function getNavigatorClipboardText(): Promise<string | null> {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    }
  } catch (error) {
    // Clipboard access denied or not available
  }
  return null;
}
