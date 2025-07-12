import {ComponentChildren, createContext} from 'preact';
import {useContext, useState} from 'preact/hooks';

export interface VirtualClipboard {
  value: string;
  set: (value: string) => void;
}

const VirtualClipboardContext = createContext<VirtualClipboard | null>(null);

export function VirtualClipboardProvider(props: {children?: ComponentChildren}) {
  const [clipboardValue, setClipboardValue] = useState('');
  const virtualClipboard: VirtualClipboard = {
    value: clipboardValue,
    set: (value) => setClipboardValue(value),
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
    throw new Error(`virtualClipboard is null, make sure to add <VirtualClipboardProvider>`);
  }
  return virtualClipboard;
}
