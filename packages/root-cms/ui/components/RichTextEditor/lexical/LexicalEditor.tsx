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
import {autokey} from '../../../utils/rand.js';
import {BlockComponentsProvider} from './hooks/useBlockComponents.js';
import {InlineComponentsProvider} from './hooks/useInlineComponents.js';
import {
  SharedHistoryProvider,
  useSharedHistory,
} from './hooks/useSharedHistory.js';
import {ToolbarProvider} from './hooks/useToolbar.js';
import {LexicalTheme} from './LexicalTheme.js';
import {useBlockComponentModal} from './nodes/BlockComponentModal.js';
import {
  $createBlockComponentNode,
  $isBlockComponentNode,
  BlockComponentNode,
} from './nodes/BlockComponentNode.js';
import {useInlineComponentModal} from './nodes/InlineComponentModal.js';
import {
  $createInlineComponentNode,
  $isInlineComponentNode,
  InlineComponentNode,
} from './nodes/InlineComponentNode.js';
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
    BlockComponentNode,
    InlineComponentNode,
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
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
  autosize?: boolean;
  blockComponents?: schema.Schema[];
  inlineComponents?: schema.Schema[];
}

export function LexicalEditor(props: LexicalEditorProps) {
  // This component sets up the context providers and shell for lexical, and
  // then renders the <Editor> component which can use the shared context states
  // to render the rich text editor.

  return (
    <LexicalComposer initialConfig={INITIAL_CONFIG}>
      <SharedHistoryProvider>
        <ToolbarProvider>
          <div
            className={joinClassNames(
              props.className,
              'LexicalEditor',
              !props.autosize && 'LexicalEditor--withMaxHeight'
            )}
          >
            <Editor
              placeholder={props.placeholder}
              value={props.value}
              onChange={props.onChange}
              onFocus={props.onFocus}
              onBlur={props.onBlur}
              blockComponents={props.blockComponents}
              inlineComponents={props.inlineComponents}
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
  blockComponents?: schema.Schema[];
  inlineComponents?: schema.Schema[];
}

function Editor(props: EditorProps) {
  const {historyState} = useSharedHistory();
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const [isLinkEditMode, setIsLinkEditMode] = useState(false);
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLElement | null>(null);
  const blockComponentsMap = useMemo(() => {
    const map = new Map<string, schema.Schema>();
    BUILT_IN_BLOCKS.forEach((block) => {
      map.set(block.name, block);
    });
    props.blockComponents?.forEach((block) => {
      map.set(block.name, block);
    });
    return map;
  }, [props.blockComponents]);
  const blockComponents = Array.from(blockComponentsMap.values());
  const blockComponentModal = useBlockComponentModal();
  const inlineComponentsMap = useMemo(() => {
    const map = new Map<string, schema.Schema>();
    props.inlineComponents?.forEach((component) => {
      map.set(component.name, component);
    });
    return map;
  }, [props.inlineComponents]);
  const inlineComponents = Array.from(inlineComponentsMap.values());
  const inlineComponentModal = useInlineComponentModal();

  // The "onRef" var is used as a callback, so it's typed to `any` here to avoid
  // type warnings.
  const onRef: any = (el: HTMLDivElement) => {
    if (el) {
      setFloatingAnchorElem(el);
    }
  };

  const openBlockComponentModal = (
    blockName: string,
    options?: {
      mode?: 'create' | 'edit';
      initialValue?: Record<string, any>;
      nodeKey?: NodeKey;
    }
  ) => {
    const schemaDef = blockComponentsMap.get(blockName);
    if (!schemaDef) {
      return;
    }
    const mode = options?.mode ?? 'create';
    const initialValue = options?.initialValue
      ? cloneData(options.initialValue)
      : getDefaultFieldValue(schemaDef);
    blockComponentModal.open({
      schema: schemaDef,
      mode,
      initialValue,
      onSubmit: (data: Record<string, any>) => {
        if (mode === 'edit' && options?.nodeKey) {
          updateBlockComponent(options.nodeKey, data);
        } else {
          insertBlockComponent(schemaDef.name, data);
        }
      },
    });
  };

  const insertBlockComponent = (
    blockName: string,
    data: Record<string, any>
  ) => {
    editor.update(() => {
      const node = $createBlockComponentNode(blockName, data);
      $insertNodes([node]);
      node.selectNext();
    });
  };

  const updateBlockComponent = (
    nodeKey: NodeKey,
    data: Record<string, any>
  ) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isBlockComponentNode(node)) {
        node.setBlockData(data);
      }
    });
  };

  const openInlineComponentModal = (
    componentName: string,
    options?: {
      mode?: 'create' | 'edit';
      initialValue?: Record<string, any>;
      componentId?: string;
      nodeKey?: NodeKey;
    }
  ) => {
    const schemaDef = inlineComponentsMap.get(componentName);
    if (!schemaDef) {
      return;
    }
    const mode = options?.mode ?? 'create';
    const initialValue = options?.initialValue
      ? cloneData(options.initialValue)
      : getDefaultFieldValue(schemaDef);
    const componentId = options?.componentId || autokey();
    inlineComponentModal.open({
      schema: schemaDef,
      componentId,
      mode,
      initialValue,
      onSubmit: (value) => {
        if (mode === 'edit' && options?.nodeKey) {
          updateInlineComponent(
            options.nodeKey,
            componentName,
            value.componentId,
            value.data
          );
        } else {
          insertInlineComponent(componentName, value.componentId, value.data);
        }
      },
    });
  };

  const insertInlineComponent = (
    componentName: string,
    componentId: string,
    data: Record<string, any>
  ) => {
    editor.update(() => {
      const node = $createInlineComponentNode(componentName, componentId, data);
      $insertNodes([node]);
      node.selectNext();
    });
  };

  const updateInlineComponent = (
    nodeKey: NodeKey,
    componentName: string,
    componentId: string,
    data: Record<string, any>
  ) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isInlineComponentNode(node)) {
        node.setComponentName(componentName);
        node.setComponentId(componentId);
        node.setComponentData(data);
      }
    });
  };

  return (
    <InlineComponentsProvider
      components={inlineComponentsMap}
      onEditComponent={(componentName, options) =>
        openInlineComponentModal(componentName, {
          mode: options?.mode ?? 'edit',
          initialValue: options?.initialValue,
          componentId: options?.componentId,
          nodeKey: options?.nodeKey,
        })
      }
    >
      <BlockComponentsProvider
        blocks={blockComponentsMap}
        onEditBlock={openBlockComponentModal}
      >
        <OnChangePlugin value={props.value} onChange={props.onChange} />
        <ToolbarPlugin
          editor={editor}
          activeEditor={activeEditor}
          setActiveEditor={setActiveEditor}
          setIsLinkEditMode={setIsLinkEditMode}
          blockComponents={blockComponents}
          inlineComponents={inlineComponents}
          onInsertBlockComponent={(blockName) =>
            openBlockComponentModal(blockName, {mode: 'create'})
          }
          onInsertInlineComponent={(componentName) =>
            openInlineComponentModal(componentName, {mode: 'create'})
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
      </BlockComponentsProvider>
    </InlineComponentsProvider>
  );
}

const PLACEHOLDERS = [
  'Once upon a placeholder...',
  'Start writing something legendary...',
  'Words go here. Preferably brilliant ones...',
  'Compose like nobody’s watching...',
  'Add text that makes Hemingway jealous...',
  'Here lies your unwritten brilliance...',
  'This is where the magic happens...',
  'Let the words flow...',
  'In the beginning, there was a blank page...',
  'To write, or not to write, that is the question...',
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
