import './EditorJSEditor.css';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import ImageTool from '@editorjs/image';
import NestedList from '@editorjs/nested-list';
import RawHtmlTool from '@editorjs/raw';
import {useEffect, useRef, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {
  RichTextData,
  testSameRichTextContent,
} from '../../../../shared/richtext.js';
import {joinClassNames} from '../../../utils/classes.js';
import {uploadFileToGCS} from '../../../utils/gcs.js';
import {isObject} from '../../../utils/objects.js';
import Strikethrough from './tools/Strikethrough.js';
import Superscript from './tools/Superscript.js';
import Underline from './tools/Underline.js';

export interface EditorJSEditorProps {
  className?: string;
  placeholder?: string;
  value?: any;
  onChange?: (data: any) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
  blockComponents?: schema.Schema[];
  inlineComponents?: schema.Schema[];
}

export function EditorJSEditor(props: EditorJSEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<any>(null);
  /**
   * The content currently reflected in the editor, either because the user
   * typed it or because it was rendered from `props.value`. Compared against
   * incoming values to tell an echo of the editor's own change apart from an
   * external replacement.
   */
  const currentValueRef = useRef<RichTextData | null>(null);

  const placeholder = props.placeholder || 'Start typing...';

  useEffect(() => {
    if (!editor) {
      return;
    }
    // Values that match what the editor already holds are ignored, so typing
    // doesn't re-render (and reset the cursor).
    // NOTE(stevenle): the content is compared rather than `time` because an
    // external replacement can carry an older timestamp, e.g. "discard draft
    // edits" restores the published version of the doc.
    const newValue: RichTextData | null = isObject(props.value)
      ? props.value
      : null;
    if (testSameRichTextContent(currentValueRef.current, newValue)) {
      return;
    }
    currentValueRef.current = newValue;
    const blocks = newValue?.blocks || [];
    editor.render({
      ...newValue,
      // EditorJS requires at least one block, so an empty value renders as an
      // empty paragraph.
      blocks:
        blocks.length > 0 ? blocks : [{type: 'paragraph', data: {text: ''}}],
    });
  }, [editor, props.value]);

  useEffect(() => {
    const holder = editorRef.current!;
    // TODO(stevenle): fix type issues.
    const EditorJSClass = EditorJS as any;
    const editor = new EditorJSClass({
      holder: holder,
      placeholder: placeholder,
      inlineToolbar: [
        'bold',
        'italic',
        'underline',
        'strikethrough',
        'superscript',
        'link',
      ],
      tools: {
        heading: {
          class: Header,
          config: {
            placeholder: 'Enter a header',
            levels: [2, 3, 4, 5],
            defaultLevel: 2,
          },
        },
        strikethrough: {
          class: Strikethrough,
        },
        superscript: {
          class: Superscript,
        },
        underline: {
          class: Underline,
        },
        image: {
          class: ImageTool,
          config: {
            uploader: gcsUploader(),
            captionPlaceholder: 'Alt text',
          },
        },
        unorderedList: {
          class: NestedList,
          inlineToolbar: true,
          config: {
            defaultStyle: 'unordered',
          },
          toolbox: {
            name: 'unorderedList',
            title: 'Bulleted List',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><line x1="9" x2="19" y1="7" y2="7" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="9" x2="19" y1="12" y2="12" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="9" x2="19" y1="17" y2="17" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5.00001 17H4.99002"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5.00001 12H4.99002"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5.00001 7H4.99002"/></svg>',
          },
        },
        orderedList: {
          class: NestedList,
          inlineToolbar: true,
          config: {
            defaultStyle: 'ordered',
          },
          toolbox: {
            name: 'orderedList',
            title: 'Numbered List',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><line x1="12" x2="19" y1="7" y2="7" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="12" x2="19" y1="12" y2="12" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="12" x2="19" y1="17" y2="17" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M7.79999 14L7.79999 7.2135C7.79999 7.12872 7.7011 7.0824 7.63597 7.13668L4.79999 9.5"/></svg>',
          },
        },
        html: {
          class: RawHtmlTool,
          toolbox: {
            name: 'HTML',
          },
        },
        // TODO(stevenle): issue with Table because firestore doesn't support
        // nested arrays.
        // table: Table,
      },
      onReady: () => {
        setEditor(editor);
      },
      onChange: () => {
        editor
          .save()
          .then((richTextData: RichTextData) => {
            currentValueRef.current = richTextData;
            if (props.onChange) {
              props.onChange(richTextData);
            }
          })
          .catch((err: any) => {
            console.error('richtext error: ', err);
          });
      },
    });
    return () => {
      // Ensure `.destroy()` exists.
      // https://github.com/blinkk/rootjs/issues/525
      if (editor && typeof editor.destroy === 'function') {
        editor.destroy();
      }
    };
  }, []);

  return (
    <div
      ref={editorRef}
      className={joinClassNames(props.className, 'EditorJSEditor')}
    />
  );
}

function gcsUploader() {
  return {
    uploadByFile: async (file: File) => {
      try {
        const imageMeta = await uploadFileToGCS(file);
        let imageUrl = imageMeta.src;
        if (isGciUrl(imageUrl)) {
          imageUrl = `${imageUrl}=s0-e365`;
        }
        console.log(imageMeta);
        return {success: 1, file: {...imageMeta, url: imageUrl}};
      } catch (err) {
        console.error(err);
        return {success: 0, error: err};
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    uploadByUrl: async (url: string) => {
      return {success: 0, error: 'upload by url not currently supported'};
    },
  };
}

function isGciUrl(url: string) {
  return url.startsWith('https://lh3.googleusercontent.com/');
}
