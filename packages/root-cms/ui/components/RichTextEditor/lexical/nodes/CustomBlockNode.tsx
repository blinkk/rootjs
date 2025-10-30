import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {DecoratorBlockNode} from '@lexical/react/LexicalDecoratorBlockNode';
import {useLexicalNodeSelection} from '@lexical/react/useLexicalNodeSelection';
import {mergeRegister} from '@lexical/utils';
import {Button} from '@mantine/core';
import {
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import {useEffect, useMemo} from 'preact/hooks';
import {joinClassNames} from '../../../../utils/classes.js';
import {testIsImageFile} from '../../../../utils/gcs.js';
import {
  getSchemaPreviewImage,
  getSchemaPreviewTitle,
} from '../../../../utils/schema-previews.js';
import {useCustomBlocks} from '../hooks/useCustomBlocks.js';

interface CustomBlockComponentProps {
  blockName: string;
  data: Record<string, any>;
  nodeKey: NodeKey;
}

function CustomBlockComponent(props: CustomBlockComponentProps) {
  const {nodeKey} = props;
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);

  const {blocks, onEditBlock} = useCustomBlocks();
  const schemaDef = blocks.get(props.blockName);
  const label = schemaDef?.label || schemaDef?.name || props.blockName;

  const previewTitle = useMemo(() => {
    if (!schemaDef) {
      return undefined;
    }
    return getSchemaPreviewTitle(schemaDef, props.data);
  }, [schemaDef, props.data]);
  const previewImage = useMemo(() => {
    if (!schemaDef) {
      return undefined;
    }
    return getSchemaPreviewImage(schemaDef, props.data);
  }, [schemaDef, props.data]);

  useEffect(() => {
    return mergeRegister(
      // Click to toggle selection of the node.
      editor.registerCommand(
        CLICK_COMMAND,
        (e: MouseEvent) => {
          const target = e.target as HTMLElement | null;
          if (!target) {
            return false;
          }

          // Make sure the click came from *this* node’s root DOM.
          const root = target.closest(`[data-node-key="${nodeKey}"]`);
          if (!root) {
            return false;
          }
          // Prevent the editor from moving the caret inside.
          e.preventDefault();
          e.stopPropagation();
          // Toggle selection.
          if (!isSelected) {
            clearSelection();
            setSelected(true);
          } else {
            setSelected(false);
          }
          return true;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  }, [editor, isSelected, nodeKey, clearSelection, setSelected]);

  return (
    <div
      className={joinClassNames(
        'LexicalEditor__customBlock',
        isSelected && 'LexicalEditor__customBlock--selected'
      )}
      data-node-key={nodeKey}
    >
      <div className="LexicalEditor__customBlock__header">
        <div className="LexicalEditor__customBlock__header__title">{label}</div>
        {schemaDef && onEditBlock && (
          <div className="LexicalEditor__customBlock__actions">
            <Button
              size="xs"
              variant="default"
              compact
              onClick={() =>
                onEditBlock(props.blockName, {
                  mode: 'edit',
                  nodeKey: props.nodeKey,
                  initialValue: props.data,
                })
              }
            >
              Edit block
            </Button>
          </div>
        )}
      </div>
      {previewImage && testIsImageFile(previewImage) && (
        <div className="LexicalEditor__customBlock__previewImage">
          <img src={previewImage} />
        </div>
      )}
      {previewTitle && (
        <div className="LexicalEditor__customBlock__preview">
          {previewTitle}
        </div>
      )}
    </div>
  );
}

export type SerializedCustomBlockNode = Spread<
  {
    type: 'custom-block';
    blockName: string;
    data: Record<string, any>;
    version: 1;
  },
  SerializedLexicalNode
>;

export class CustomBlockNode extends DecoratorBlockNode {
  __blockName: string;
  __blockData: Record<string, any>;

  static getType(): string {
    return 'custom-block';
  }

  static clone(node: CustomBlockNode) {
    return new CustomBlockNode(node.__blockName, node.__blockData, node.__key);
  }

  static importJSON(serializedNode: SerializedCustomBlockNode) {
    const {blockName, data} = serializedNode;
    return new CustomBlockNode(blockName, data);
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'custom-block',
      blockName: this.__blockName,
      data: cloneData(this.__blockData),
      version: 1,
    };
  }

  constructor(blockName: string, data?: Record<string, any>, key?: NodeKey) {
    super('', key);
    this.__blockName = blockName;
    this.__blockData = data ? cloneData(data) : {};
  }

  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.className = 'LexicalEditor__customBlockWrapper';
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  decorate() {
    return (
      <CustomBlockComponent
        blockName={this.__blockName}
        data={this.__blockData}
        nodeKey={this.__key}
      />
    );
  }

  getBlockName() {
    return this.__blockName;
  }

  getBlockData() {
    return this.__blockData;
  }

  setBlockData(data: Record<string, any>) {
    const writable = this.getWritable();
    writable.__blockData = cloneData(data);
  }
}

export function $createCustomBlockNode(
  blockName: string,
  data?: Record<string, any>
) {
  return new CustomBlockNode(blockName, data);
}

export function $isCustomBlockNode(node: any): node is CustomBlockNode {
  return node instanceof CustomBlockNode;
}

function cloneData<T>(data: T): T {
  if (data === undefined || data === null) {
    return data;
  }
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data));
}
