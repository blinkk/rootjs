import {ComponentChildren, createContext} from 'preact';
import {useContext} from 'preact/hooks';
import * as schema from '../../../../../core/schema.js';
import {NodeKey} from 'lexical';

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

const CustomBlocksContext = createContext<CustomBlocksContextValue>({
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
    <CustomBlocksContext.Provider
      value={{blocks: props.blocks, onEditBlock: props.onEditBlock}}
    >
      {props.children}
    </CustomBlocksContext.Provider>
  );
}

export function useCustomBlocks() {
  return useContext(CustomBlocksContext);
}
