// NOTE: The previous editor implementation used EditorJS. This file attempts
// to migrate the editor to Lexical using the vanilla (non React) APIs. Lexical
// is imported directly from the `lexical` npm package. The implementation here
// is a lightweight wrapper so that the rest of the CMS can continue to use the
// same Preact based component interface.
import {useEffect, useRef, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import './RichTextEditor.css';
import {uploadFileToGCS} from '../../utils/gcs.js';
import {isObject} from '../../utils/objects.js';
import {createEditor} from 'lexical';

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
    if (!newValue || !validateRichTextData(newValue)) {
      return;
    }
    if (currentValue?.time !== newValue?.time && editorRef.current) {
      editorRef.current.innerHTML = richTextToHtml(newValue);
      setCurrentValue(newValue);
    }
  }, [props.value]);

  useEffect(() => {
    const holder = editorRef.current!;

    const editorInstance = createEditor();
    editorInstance.setRootElement(holder);
    holder.innerHTML = richTextToHtml(currentValue);

    const unregister = editorInstance.registerUpdateListener(({editorState}: any) => {
      const json = editorState.toJSON();
      const data = lexicalStateToRichText(json);
      setCurrentValue(data);
      props.onChange?.(data);
    });

    setEditor(editorInstance);
    return () => {
      unregister();
      if (editorInstance.destroy) {
        editorInstance.destroy();
      }
    };
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    uploadByUrl: async (url: string) => {
      return {success: 0, error: 'upload by url not currently supported'};
    },
  };
}

function isGciUrl(url: string) {
  return url.startsWith('https://lh3.googleusercontent.com/');
}

// Converts rich text data (editorjs style) to a simple HTML representation.
function richTextToHtml(data: RichTextData): string {
  const blocks = data?.blocks || [];
  return blocks
    .map((block) => {
      if (block.type === 'heading') {
        const level = block.data?.level || 2;
        return `<h${level}>${block.data?.text || ''}</h${level}>`;
      }
      if (block.type === 'image') {
        const url = block.data?.file?.url || '';
        const alt = block.data?.file?.alt || '';
        return `<img src="${url}" alt="${alt}">`;
      }
      return `<p>${block.data?.text || ''}</p>`;
    })
    .join('');
}

// Converts a HTML string into the simplified rich text format used throughout
// the CMS. This is a very naive implementation and only supports paragraphs and
// basic headings.
function htmlToRichText(html: string): RichTextData {
  const container = document.createElement('div');
  container.innerHTML = html;
  const blocks: any[] = [];
  container.childNodes.forEach((node) => {
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    if (el.tagName.toLowerCase().match(/^h[1-6]$/)) {
      const level = parseInt(el.tagName.substring(1), 10);
      blocks.push({type: 'heading', data: {level, text: el.innerHTML}});
    } else if (el.tagName.toLowerCase() === 'img') {
      blocks.push({
        type: 'image',
        data: {file: {url: el.getAttribute('src') || '', alt: el.getAttribute('alt') || ''}},
      });
    } else {
      blocks.push({type: 'paragraph', data: {text: el.innerHTML}});
    }
  });
  return {blocks, time: Date.now()};
}

// Attempts to convert a Lexical editor state JSON into the simplified rich text
// structure. Only a subset of node types are supported.
function lexicalStateToRichText(state: any): RichTextData {
  const blocks: any[] = [];
  const children = state?.root?.children || [];
  for (const node of children) {
    if (node.type === 'heading') {
      blocks.push({type: 'heading', data: {level: node.tag, text: collectText(node)}});
    } else if (node.type === 'text') {
      blocks.push({type: 'paragraph', data: {text: node.text}});
    } else if (node.type === 'paragraph') {
      blocks.push({type: 'paragraph', data: {text: collectText(node)}});
    }
  }
  return {blocks, time: Date.now()};
}

function collectText(node: any): string {
  if (!node.children) {
    return node.text || '';
  }
  return node.children.map((n: any) => collectText(n)).join('');
}
