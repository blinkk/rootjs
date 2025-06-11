import './LexicalEditor.css';

import {AutoLinkNode, LinkNode} from '@lexical/link';
import {ListItemNode, ListNode} from '@lexical/list';
import {InitialConfigType, LexicalComposer} from '@lexical/react/LexicalComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';
import {LinkPlugin} from '@lexical/react/LexicalLinkPlugin';
import {ListPlugin} from '@lexical/react/LexicalListPlugin';
import {HeadingNode} from '@lexical/rich-text';
import {joinClassNames} from '../../utils/classes.js';
import {SharedHistoryProvider, useSharedHistory} from './hooks/useSharedHistory.js';
import {ToolbarProvider} from './hooks/useToolbar.js';
import {ToolbarPlugin} from './plugins/ToolbarPlugin.js';
import {useMemo, useState} from 'preact/hooks';
import {ShortcutsPlugin} from './plugins/ShortcutsPlugin.js';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {TabIndentationPlugin} from '@lexical/react/LexicalTabIndentationPlugin';
import {MarkdownTransformPlugin} from './plugins/MarkdownTransformPlugin.js';
import {LexicalTheme} from './LexicalTheme.js';
import {FloatingToolbarPlugin} from './plugins/FloatingToolbarPlugin.js';
import {OnChangePlugin} from './plugins/OnChangePlugin.js';
import {RichTextData} from '../../../shared/richtext.js';
import {FloatingLinkEditorPlugin} from './plugins/FloatingLinkEditorPlugin.js';

const INITIAL_CONFIG: InitialConfigType = {
  namespace: 'RootCMS',
  theme: LexicalTheme,
  nodes: [
    AutoLinkNode,
    HeadingNode,
    // ImageNode,
    LinkNode,
    ListNode,
    ListItemNode,
    // YouTubeNode,
  ],
  onError: (err: Error) => {
    console.error('[LexicalEditor] error:', err);
    throw err;
  },
};

export interface LexicalEditorProps {
  className?: string;
  placeholder?: string;
  value?: RichTextData | null;
  onChange?: (value: RichTextData | null) => void;
}

export function LexicalEditor(props: LexicalEditorProps) {
  // This component sets up the context providers and shell for lexical, and
  // then renders the <Editor> component which can use the shared context states
  // to render the rich text editor.
  return (
    <LexicalComposer initialConfig={INITIAL_CONFIG}>
      <SharedHistoryProvider>
        <ToolbarProvider>
          <div className={joinClassNames(props.className, 'LexicalEditor')}>
            <Editor
              placeholder={props.placeholder}
              value={props.value}
              onChange={props.onChange}
            />
          </div>
        </ToolbarProvider>
      </SharedHistoryProvider>
    </LexicalComposer>
  );
}

interface EditorProps {
  placeholder?: string;
  value?: RichTextData | null;
  onChange?: (value: RichTextData | null) => void;
}

function Editor(props: EditorProps) {
  const {historyState} = useSharedHistory();
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const [isLinkEditMode, setIsLinkEditMode] = useState(false);
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLElement | null>(null);

  const onRef = (el: HTMLDivElement) => {
    if (el) {
      setFloatingAnchorElem(el);
    }
  };

  return (
    <>
      <OnChangePlugin value={props.value} onChange={props.onChange} />
      <ToolbarPlugin
        editor={editor}
        activeEditor={activeEditor}
        setActiveEditor={setActiveEditor}
        setIsLinkEditMode={setIsLinkEditMode}
      />
      <ShortcutsPlugin
        editor={activeEditor}
        setIsLinkEditMode={setIsLinkEditMode}
      />
      <HistoryPlugin externalHistoryState={historyState} />
      <RichTextPlugin
        contentEditable={
          <div className="LexicalEditor__scroller">
            <div className="LexicalEditor__root" ref={onRef}>
              <ContentEditable
                className="LexicalEditor__editor"
                placeholder={<Placeholder placeholder={props.placeholder} />}
              />
            </div>
          </div>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <LinkPlugin />
      <ListPlugin />
      <TabIndentationPlugin maxIndent={7} />
      <MarkdownTransformPlugin />
      {floatingAnchorElem && (
        <>
          <FloatingToolbarPlugin
            anchorElem={floatingAnchorElem}
            setIsLinkEditMode={setIsLinkEditMode}
          />
          <FloatingLinkEditorPlugin
            anchorElem={floatingAnchorElem}
            isLinkEditMode={isLinkEditMode}
            setIsLinkEditMode={setIsLinkEditMode}
          />
        </>
      )}
    </>
  );
}

const PLACEHOLDERS = [
  'Once upon a placeholder...',
  'Start writing something legendary...',
  'Words go here. Preferably brilliant ones...',
  'Compose like nobody’s watching...',
  'Your masterpiece begins here...',
  'Add text that makes Hemingway jealous...',
  'Here lies your unwritten brilliance...',
];

function getRandPlaceholder() {
  const rand = Math.floor(Math.random() * PLACEHOLDERS.length);
  const placeholder = PLACEHOLDERS[rand];
  return placeholder;
}

interface PlaceholderProps {
  placeholder?: string;
}

function Placeholder(props: PlaceholderProps) {
  const placeholder = useMemo(() => props.placeholder || getRandPlaceholder(), []);
  return (
    <div className="LexicalEditor__placeholder">{placeholder}</div>
  );
}
