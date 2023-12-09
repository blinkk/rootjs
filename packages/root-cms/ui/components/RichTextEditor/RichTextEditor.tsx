import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Table from '@editorjs/table';
import {useEffect, useRef, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import './RichTextEditor.css';
import {isObject} from '../../utils/objects.js';

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
  const editorRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<any>(null);
  const [currentValue, setCurrentValue] = useState<RichTextData>({});

  const placeholder = props.placeholder || 'Start typing...';

  useEffect(() => {
    const newValue = props.value;
    if (editor && currentValue?.time !== newValue?.time) {
      const currentTime = currentValue?.time || 0;
      const newValueTime = newValue?.time || 0;
      if (newValueTime > currentTime && validateRichTextData(newValue)) {
        editor.render(newValue);
      }
    }
  }, [props.value]);

  useEffect(() => {
    const holder = editorRef.current!;
    // TODO(stevenle): fix type issues.
    const EditorJSClass = EditorJS as any;
    const editor = new EditorJSClass({
      holder: holder,
      placeholder: placeholder,
      inlineToolbar: true,
      tools: {
        header: {
          class: Header,
          config: {
            placeholder: 'Enter a header',
            levels: [2, 3, 4],
            defaultLevel: 2,
          },
        },
        list: {
          class: List,
          inlineToolbar: true,
          config: {
            defaultStyle: 'unordered',
          },
        },
        table: Table,
      },
      onReady: () => {
        setEditor(editor);
      },
      onChange: () => {
        editor
          .save()
          .then((richTextData: RichTextData) => {
            setCurrentValue(richTextData);
            if (props.onChange) {
              props.onChange(richTextData);
            }
          })
          .catch((err: any) => {
            console.error('richtext error: ', err);
          });
      },
    });
    return () => editor.destroy();
  }, []);

  return (
    <div
      ref={editorRef}
      className={joinClassNames(props.className, 'RichTextEditor')}
    />
  );
}

export function validateRichTextData(data: RichTextData) {
  return isObject(data) && Array.isArray(data.blocks);
}
