import './LexicalEditor.css';

import {AutoLinkNode, LinkNode} from '@lexical/link';
import {ListItemNode, ListNode} from '@lexical/list';
import {InitialConfigType, LexicalComposer} from '@lexical/react/LexicalComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';
import {HeadingNode} from '@lexical/rich-text';
import {joinClassNames} from '../../utils/classes.js';
import {EditorThemeClasses} from 'lexical';
import {SharedHistoryProvider, useSharedHistory} from './hooks/useSharedHistory.js';
import {ToolbarProvider} from './hooks/useToolbar.js';
import {ToolbarPlugin} from './plugins/ToolbarPlugin.js';
import {useState} from 'preact/hooks';
import {ShortcutsPlugin} from './plugins/ShortcutsPlugin.js';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';

const THEME: EditorThemeClasses = {};

const INITIAL_CONFIG: InitialConfigType = {
  namespace: 'RootCMS',
  theme: THEME,
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
  // placeholder?: string;
  // value?: RichTextData;
  // onChange?: (value: RichTextData) => void;
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
            <Editor />
          </div>
        </ToolbarProvider>
      </SharedHistoryProvider>
    </LexicalComposer>
  );
}

interface EditorProps {
}

function Editor(props: EditorProps) {
  const {historyState} = useSharedHistory();
  const placeholder = getRandPlaceholder();
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const [isLinkEditMode, setIsLinkEditMode] = useState(false);
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);

  const onRef = (el: HTMLDivElement) => {
    if (el) {
      console.log('floating anchor elem:', el);
      setFloatingAnchorElem(el);
    }
  };

  return (
    <>
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
      <RichTextPlugin
        contentEditable={
          <div className="LexicalEditor__scroller">
            <div className="LexicalEditor__root" ref={onRef}>
              <ContentEditable
                className="LexicalEditor__editor"
                placeholder={<Placeholder placeholder={placeholder} />}
              />
            </div>
          </div>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
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
  placeholder: string;
}

function Placeholder(props: PlaceholderProps) {
  return (
    <div className="LexicalEditor__placeholder">{props.placeholder}</div>
  );
}
