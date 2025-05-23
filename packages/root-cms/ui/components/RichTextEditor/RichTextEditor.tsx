import {useEffect} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import './RichTextEditor.css';

import {
  LexicalComposer,
  type InitialConfigType,
} from '@lexical/react/LexicalComposer';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {ListPlugin} from '@lexical/react/LexicalListPlugin';
import {OnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {AutoFocusPlugin} from '@lexical/react/LexicalAutoFocusPlugin';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  $getRoot,
} from 'lexical';
import {
  $generateHtmlFromNodes,
  $generateNodesFromDOM,
} from '@lexical/html';
import {HeadingNode} from '@lexical/rich-text';
import {
  ListNode,
  ListItemNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';

export interface RichTextEditorProps {
  className?: string;
  placeholder?: string;
  value?: string;
  onChange?: (data: string) => void;
}

export type RichTextData = string;

function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  return (
    <div className="rte-toolbar">
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
      >
        <b>B</b>
      </button>
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
      >
        <i>I</i>
      </button>
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
      >
        <u>U</u>
      </button>
      <button
        type="button"
        onClick={() =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        }
      >
        OL
      </button>
      <button
        type="button"
        onClick={() =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
      >
        UL
      </button>
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'h2')}
      >
        H2
      </button>
    </div>
  );
}

function HtmlOnChangePlugin(props: {
  value?: string;
  onChange?: (data: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const html = props.value || '';
    editor.update(() => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(html, 'text/html');
      const nodes = $generateNodesFromDOM(editor, dom);
      const root = $getRoot();
      root.clear();
      root.append(...nodes);
    });
  }, [props.value, editor]);

  return (
    <OnChangePlugin
      onChange={(editorState, editor) => {
        if (!props.onChange) return;
        editorState.read(() => {
          const htmlString = $generateHtmlFromNodes(editor, null);
          props.onChange!(htmlString);
        });
      }}
    />
  );
}

export function RichTextEditor(props: RichTextEditorProps) {
  const initialConfig: InitialConfigType = {
    namespace: 'RichTextEditor',
    theme: {},
    onError(error) {
      throw error;
    },
    nodes: [HeadingNode, ListNode, ListItemNode],
  };

  return (
    <div className={joinClassNames('RichTextEditor', props.className)}>
      <LexicalComposer initialConfig={initialConfig}>
        <ToolbarPlugin />
        <RichTextPlugin
          contentEditable={
            <div className="editor-container">
              <ContentEditable className="rte-content" />
              {props.placeholder && (
                <div className="rte-placeholder">{props.placeholder}</div>
              )}
            </div>
          }
          placeholder={null}
        />
        <HistoryPlugin />
        <ListPlugin />
        <AutoFocusPlugin />
        <HtmlOnChangePlugin value={props.value} onChange={props.onChange} />
      </LexicalComposer>
    </div>
  );
}

export function validateRichTextData(data: RichTextData) {
  return typeof data === 'string';
}
