import './LexicalEditor.css';

import {AutoLinkNode, LinkNode} from '@lexical/link';
import {ListItemNode, ListNode} from '@lexical/list';
import {
  InitialConfigType,
  LexicalComposer,
} from '@lexical/react/LexicalComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {LinkPlugin} from '@lexical/react/LexicalLinkPlugin';
import {ListPlugin} from '@lexical/react/LexicalListPlugin';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {TabIndentationPlugin} from '@lexical/react/LexicalTabIndentationPlugin';
import {HeadingNode} from '@lexical/rich-text';
import {$getNodeByKey, $insertNodes, NodeKey} from 'lexical';
import {useMemo, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {RichTextData} from '../../../../shared/richtext.js';
import {joinClassNames} from '../../../utils/classes.js';
import {getDefaultFieldValue} from '../../../utils/fields.js';
import {cloneData} from '../../../utils/objects.js';
import {CustomBlocksProvider} from './hooks/useCustomBlocks.js';
import {
  SharedHistoryProvider,
  useSharedHistory,
} from './hooks/useSharedHistory.js';
import {ToolbarProvider} from './hooks/useToolbar.js';
import {LexicalTheme} from './LexicalTheme.js';
import {CustomBlockModal} from './nodes/CustomBlockModal.js';
import {
  $createCustomBlockNode,
  $isCustomBlockNode,
  CustomBlockNode,
} from './nodes/CustomBlockNode.js';
import {FloatingLinkEditorPlugin} from './plugins/FloatingLinkEditorPlugin.js';
import {FloatingToolbarPlugin} from './plugins/FloatingToolbarPlugin.js';
import {MarkdownTransformPlugin} from './plugins/MarkdownTransformPlugin.js';
import {OnChangePlugin} from './plugins/OnChangePlugin.js';
import {ShortcutsPlugin} from './plugins/ShortcutsPlugin.js';
import {ToolbarPlugin} from './plugins/ToolbarPlugin.js';
import {TrailingParagraphPlugin} from './plugins/TrailingParagraphPlugin.js';

const INITIAL_CONFIG: InitialConfigType = {
  namespace: 'RootCMS',
  theme: LexicalTheme,
  nodes: [
    AutoLinkNode,
    HeadingNode,
    LinkNode,
    ListNode,
    ListItemNode,
    CustomBlockNode,
  ],
  onError: (err: Error) => {
    console.error('[LexicalEditor] error:', err);
    throw err;
  },
};

interface CustomBlockModalState {
  schema: schema.Schema;
  mode: 'create' | 'edit';
  initialValue: Record<string, any>;
  nodeKey?: NodeKey;
}

export interface LexicalEditorProps {
  className?: string;
  placeholder?: string;
  value?: RichTextData | null;
  onChange?: (value: RichTextData | null) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
  customBlocks?: schema.Schema[];
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
              onFocus={props.onFocus}
              onBlur={props.onBlur}
              customBlocks={props.customBlocks}
            />
          </div>
        </ToolbarProvider>
      </SharedHistoryProvider>
    </LexicalComposer>
  );
}

const INSERT_IMAGE_BLOCK = schema.define({
  name: 'image',
  label: 'Image Embed',
  preview: {
    title: '{file.alt}',
    image: '{file.src}',
  },
  fields: [
    schema.image({
      id: 'file',
      label: 'Image',
    }),
  ],
});

const INSERT_HTML_BLOCK = schema.define({
  name: 'html',
  label: 'HTML Code',
  preview: {
    title: '{html}',
  },
  fields: [
    schema.string({
      id: 'html',
      label: 'HTML',
      help: 'HTML code to embed. Please use caution when inserting HTML.',
      variant: 'textarea',
    }),
  ],
});

const BUILT_IN_BLOCKS = [INSERT_IMAGE_BLOCK, INSERT_HTML_BLOCK];

interface EditorProps {
  placeholder?: string;
  value?: RichTextData | null;
  onChange?: (value: RichTextData | null) => void;
  /** Focus handler (currently unimplemented.) */
  onFocus?: (e: FocusEvent) => void;
  /** Blur handler (currently unimplemented.) */
  onBlur?: (e: FocusEvent) => void;
  customBlocks?: schema.Schema[];
}

function Editor(props: EditorProps) {
  const {historyState} = useSharedHistory();
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const [isLinkEditMode, setIsLinkEditMode] = useState(false);
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLElement | null>(null);
  const customBlocksMap = useMemo(() => {
    const map = new Map<string, schema.Schema>();
    BUILT_IN_BLOCKS.forEach((block) => {
      map.set(block.name, block);
    });
    props.customBlocks?.forEach((block) => {
      map.set(block.name, block);
    });
    return map;
  }, [props.customBlocks]);
  const customBlocks = Array.from(customBlocksMap.values());
  const [customBlockModalState, setCustomBlockModalState] =
    useState<CustomBlockModalState | null>(null);

  // The "onRef" var is used as a callback, so it's typed to `any` here to avoid
  // type warnings.
  const onRef: any = (el: HTMLDivElement) => {
    if (el) {
      setFloatingAnchorElem(el);
    }
  };

  const openCustomBlockModal = (
    blockName: string,
    options?: {
      mode?: 'create' | 'edit';
      initialValue?: Record<string, any>;
      nodeKey?: NodeKey;
    }
  ) => {
    const schemaDef = customBlocksMap.get(blockName);
    if (!schemaDef) {
      return;
    }
    const initialValue = options?.initialValue
      ? cloneData(options.initialValue)
      : getDefaultFieldValue(schemaDef);
    setCustomBlockModalState({
      schema: schemaDef,
      mode: options?.mode ?? 'create',
      initialValue,
      nodeKey: options?.nodeKey,
    });
  };

  const insertCustomBlock = (blockName: string, data: Record<string, any>) => {
    editor.update(() => {
      const node = $createCustomBlockNode(blockName, data);
      $insertNodes([node]);
      node.selectNext();
    });
  };

  const updateCustomBlock = (nodeKey: NodeKey, data: Record<string, any>) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isCustomBlockNode(node)) {
        node.setBlockData(data);
      }
    });
  };

  const closeCustomBlockModal = () => {
    setCustomBlockModalState(null);
  };

  const onCustomBlockSubmit = (data: Record<string, any>) => {
    if (!customBlockModalState) {
      return;
    }
    if (
      customBlockModalState.mode === 'edit' &&
      customBlockModalState.nodeKey
    ) {
      updateCustomBlock(customBlockModalState.nodeKey, data);
    } else {
      insertCustomBlock(customBlockModalState.schema.name, data);
    }
    closeCustomBlockModal();
  };

  return (
    <CustomBlocksProvider
      blocks={customBlocksMap}
      onEditBlock={openCustomBlockModal}
    >
      <OnChangePlugin
        value={props.value}
        onChange={props.onChange}
        customBlocks={customBlocksMap}
      />
      <ToolbarPlugin
        editor={editor}
        activeEditor={activeEditor}
        setActiveEditor={setActiveEditor}
        setIsLinkEditMode={setIsLinkEditMode}
        customBlocks={customBlocks}
        onInsertCustomBlock={(blockName) =>
          openCustomBlockModal(blockName, {mode: 'create'})
        }
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
      <TrailingParagraphPlugin />
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
      {customBlockModalState && (
        <CustomBlockModal
          schema={customBlockModalState.schema}
          opened={true}
          initialValue={customBlockModalState.initialValue}
          mode={customBlockModalState.mode}
          onClose={closeCustomBlockModal}
          onSubmit={onCustomBlockSubmit}
        />
      )}
    </CustomBlocksProvider>
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
  const placeholder = useMemo(
    () => props.placeholder || getRandPlaceholder(),
    []
  );
  return <div className="LexicalEditor__placeholder">{placeholder}</div>;
}
