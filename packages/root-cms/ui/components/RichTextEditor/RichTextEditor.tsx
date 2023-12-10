import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import ImageTool from '@editorjs/image';
// import List from '@editorjs/list';
import NestedList from '@editorjs/nested-list';
import RawHtmlTool from '@editorjs/raw';
// import Table from '@editorjs/table';
import {useEffect, useRef, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import './RichTextEditor.css';
import {uploadFileToGCS} from '../../utils/gcs.js';
import {normalizeString} from '../../utils/l10n.js';
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
  const [currentValue, setCurrentValue] = useState<RichTextData>({
    blocks: [{type: 'paragraph', data: {}}],
  });

  const placeholder = props.placeholder || 'Start typing...';

  useEffect(() => {
    const newValue = props.value;
    if (editor && currentValue?.time !== newValue?.time) {
      const currentTime = currentValue?.time || 0;
      const newValueTime = newValue?.time || 0;
      if (newValueTime > currentTime && validateRichTextData(newValue)) {
        editor.render(newValue);
        setCurrentValue(newValue);
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
        heading: {
          class: Header,
          config: {
            placeholder: 'Enter a header',
            levels: [2, 3, 4],
            defaultLevel: 2,
          },
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
  return isObject(data) && Array.isArray(data.blocks) && data.blocks.length > 0;
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
    uploadByUrl: async (url: string) => {
      return {success: 0, error: 'upload by url not currently supported'};
    },
  };
}

function isGciUrl(url: string) {
  return url.startsWith('https://lh3.googleusercontent.com/');
}

export function extractRichTextStrings(
  strings: Set<string>,
  data: RichTextData
) {
  const blocks = data?.blocks || [];
  blocks.forEach((block) => {
    extractBlockStrings(strings, block);
  });
}

interface ListItemData {
  content?: string;
  items?: ListItemData[];
}

function extractBlockStrings(strings: Set<string>, block: any) {
  if (!block?.type) {
    return;
  }

  function addString(text?: string) {
    if (!text) {
      return;
    }
    const str = normalizeString(text);
    if (str) {
      strings.add(str);
    }
  }

  function extractList(items?: ListItemData[]) {
    if (!items) {
      return;
    }
    items.forEach((item) => {
      addString(item.content);
      extractList(item.items);
    });
  }

  if (block.type === 'heading' || block.type === 'paragraph') {
    addString(block.data?.text);
  } else if (block.type === 'orderedList' || block.type === 'unorderedList') {
    extractList(block.data?.items);
  } else if (block.type === 'html') {
    addString(block.data?.html);
  }
}
