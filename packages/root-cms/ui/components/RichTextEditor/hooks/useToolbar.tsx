import {ElementFormatType} from 'lexical';
import {ComponentChildren, createContext} from 'preact';
import {
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'preact/hooks';

const ROOT_TYPES = {
  root: 'Root',
};

export const TOOLBAR_BLOCK_LABELS = {
  paragraph: 'Normal',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  bullet: 'Bulleted List',
  number: 'Numbered List',
};

export type ToolbarBlockType = keyof typeof TOOLBAR_BLOCK_LABELS;

const INITIAL_TOOLBAR_STATE = {
  blockType: 'paragraph' as ToolbarBlockType,
  canRedo: false,
  canUndo: false,
  codeLanguage: '',
  elementFormat: 'left' as ElementFormatType,
  isBold: false,
  isCode: false,
  isHighlight: false,
  isImageCaption: false,
  isItalic: false,
  isLink: false,
  isRTL: false,
  isStrikethrough: false,
  isSubscript: false,
  isSuperscript: false,
  isUnderline: false,
  isLowercase: false,
  isUppercase: false,
  isCapitalize: false,
  rootType: 'root' as keyof typeof ROOT_TYPES,
};

type ToolbarState = typeof INITIAL_TOOLBAR_STATE;
type ToolbarStateKey = keyof ToolbarState;
type ToolbarStateValue<Key extends ToolbarStateKey> = ToolbarState[Key];

interface ContextShape {
  toolbarState: ToolbarState;
  updateToolbarState<Key extends ToolbarStateKey>(
    key: Key,
    value: ToolbarStateValue<Key>,
  ): void;
}

const Context = createContext<ContextShape | undefined>(undefined);

interface ToolbarProviderProps {
  children?: ComponentChildren;
}

export function ToolbarProvider(props: ToolbarProviderProps) {
  const [toolbarState, setToolbarState] = useState(INITIAL_TOOLBAR_STATE);

  const updateToolbarState = useCallback(
    <Key extends ToolbarStateKey>(key: Key, value: ToolbarStateValue<Key>) => {
      setToolbarState((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    [],
  );

  const contextValue = useMemo(() => {
    return {
      toolbarState,
      updateToolbarState,
    };
  }, [toolbarState, updateToolbarState]);

  return (
    <Context.Provider value={contextValue}>{props.children}</Context.Provider>
  );
};

export function useToolbar() {
  const contextValue = useContext(Context);
  if (contextValue === undefined) {
    throw new Error('useToolbar must be used within a ToolbarProvider');
  }
  return contextValue;
}
