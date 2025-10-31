import {NodeKey} from 'lexical';
import {ComponentChildren, createContext} from 'preact';
import {useContext} from 'preact/hooks';
import * as schema from '../../../../../core/schema.js';

type CustomBlockMap = Map<string, schema.Schema>;

interface CustomBlocksContextValue {
  blocks: CustomBlockMap;
  onEditBlock?: (
    blockName: string,
    options?: {
      nodeKey?: NodeKey;
      initialValue?: Record<string, any>;
      mode?: 'create' | 'edit';
    }
  ) => void;
}

const CUSTOM_BLOCKS_CONTEXT = createContext<CustomBlocksContextValue>({
  blocks: new Map(),
});

export interface CustomBlocksProviderProps {
  blocks: CustomBlockMap;
  onEditBlock?: (
    blockName: string,
    options?: {
      nodeKey?: NodeKey;
      initialValue?: Record<string, any>;
      mode?: 'create' | 'edit';
    }
  ) => void;
  children?: ComponentChildren;
}

export function CustomBlocksProvider(props: CustomBlocksProviderProps) {
  return (
    <CUSTOM_BLOCKS_CONTEXT.Provider
      value={{blocks: props.blocks, onEditBlock: props.onEditBlock}}
    >
      {props.children}
    </CUSTOM_BLOCKS_CONTEXT.Provider>
  );
}

export function useCustomBlocks() {
  return useContext(CUSTOM_BLOCKS_CONTEXT);
}
