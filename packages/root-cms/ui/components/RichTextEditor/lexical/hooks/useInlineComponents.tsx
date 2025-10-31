import {NodeKey} from 'lexical';
import {ComponentChildren, createContext} from 'preact';
import {useContext} from 'preact/hooks';
import * as schema from '../../../../../core/schema.js';

interface InlineComponentsContextValue {
  components: Map<string, schema.Schema>;
  onEditComponent?: (
    componentName: string,
    options?: {
      nodeKey?: NodeKey;
      initialValue?: Record<string, any>;
      componentId?: string;
      mode?: 'create' | 'edit';
    }
  ) => void;
}

const INLINE_COMPONENTS_CONTEXT = createContext<InlineComponentsContextValue>({
  components: new Map(),
});

export interface InlineComponentsProviderProps {
  components: Map<string, schema.Schema>;
  onEditComponent?: (
    componentName: string,
    options?: {
      nodeKey?: NodeKey;
      initialValue?: Record<string, any>;
      componentId?: string;
      mode?: 'create' | 'edit';
    }
  ) => void;
  children?: ComponentChildren;
}

export function InlineComponentsProvider(props: InlineComponentsProviderProps) {
  return (
    <INLINE_COMPONENTS_CONTEXT.Provider
      value={{components: props.components, onEditComponent: props.onEditComponent}}
    >
      {props.children}
    </INLINE_COMPONENTS_CONTEXT.Provider>
  );
}

export function useInlineComponents() {
  return useContext(INLINE_COMPONENTS_CONTEXT);
}
