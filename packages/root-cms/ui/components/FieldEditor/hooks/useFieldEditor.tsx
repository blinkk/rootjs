import {ComponentChildren, createContext} from 'preact';
import {useContext, useMemo} from 'preact/hooks';
import {setDeepKey} from '../../../../shared/objects.js';

export class FieldEditorController {
  value: any;
  onChange?: (newValue: any) => void;

  constructor(value?: any, onChange?: (newValue: any) => void) {
    this.value = value || {};
    this.onChange = onChange;
  }

  /**
   * Subscribes to changes on a deepKey.
   */
  subscribe(deepKey: string, cb: (newValue: any) => void) {
  }

  /**
   * Sets a value to a deepKey.
   */
  set(deepKey: string, value: any) {
    setDeepKey(this.value, deepKey, value);
    if (this.onChange) {
      this.onChange(this.value);
    }
  }
}

const CONTEXT = createContext<FieldEditorController | null>(null);

export interface FieldEditorProviderProps {
  value?: any;
  onChange?: (newValue: any) => void;
  children?: ComponentChildren;
}

export function FieldEditorProvider(props: FieldEditorProviderProps) {
  const fieldEditor = useMemo(() => {
    return new FieldEditorController(props.value, props.onChange);
  }, []);
  return (
    <CONTEXT.Provider value={fieldEditor}>
      {props.children}
    </CONTEXT.Provider>
  );
}

export function useFieldEditor(): FieldEditorController {
  const fieldEditor = useContext(CONTEXT);
  if (!fieldEditor) {
    throw new Error('useFieldEditor() should be used within a <FieldEditorProvider>');
  }
  return fieldEditor;
}
