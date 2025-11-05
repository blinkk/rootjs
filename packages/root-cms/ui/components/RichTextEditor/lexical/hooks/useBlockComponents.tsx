import {NodeKey} from 'lexical';
import {ComponentChildren, createContext} from 'preact';
import {useContext} from 'preact/hooks';
import * as schema from '../../../../../core/schema.js';

type BlockComponentsMap = Map<string, schema.Schema>;

interface BlockComponentsContextValue {
  blocks: BlockComponentsMap;
  onEditBlock?: (
    blockName: string,
    options?: {
      nodeKey?: NodeKey;
      initialValue?: Record<string, any>;
      mode?: 'create' | 'edit';
    }
  ) => void;
}

const BLOCK_COMPONENTS_CONTEXT = createContext<BlockComponentsContextValue>({
  blocks: new Map(),
});

export interface CustomBlocksProviderProps {
  blocks: BlockComponentsMap;
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

export function BlockComponentsProvider(props: CustomBlocksProviderProps) {
  return (
    <BLOCK_COMPONENTS_CONTEXT.Provider
      value={{blocks: props.blocks, onEditBlock: props.onEditBlock}}
    >
      {props.children}
    </BLOCK_COMPONENTS_CONTEXT.Provider>
  );
}

export function useBlockComponents() {
  return useContext(BLOCK_COMPONENTS_CONTEXT);
}
