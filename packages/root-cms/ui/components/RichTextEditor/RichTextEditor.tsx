import {EditorJSEditor} from './editorjs/EditorJSEditor.js';

export interface RichTextEditorProps {
  className?: string;
  placeholder?: string;
  value?: any;
  onChange?: (data: any) => void;
}

export type RichTextData = {
  [key: string]: any;
  blocks: any[];
  time?: number;
};

export function RichTextEditor(props: RichTextEditorProps) {
  return <EditorJSEditor {...props} />;
}
