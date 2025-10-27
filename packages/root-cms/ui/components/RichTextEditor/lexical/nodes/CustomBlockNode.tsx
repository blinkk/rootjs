import {DecoratorBlockNode} from '@lexical/react/LexicalDecoratorBlockNode';
import {Button} from '@mantine/core';
import {LexicalEditor, NodeKey, SerializedLexicalNode, Spread} from 'lexical';
import {useMemo} from 'preact/hooks';
import {getSchemaPreviewTitle} from '../../../../utils/schema-previews.js';
import {useCustomBlocks} from '../hooks/useCustomBlocks.js';

interface CustomBlockComponentProps {
  blockName: string;
  data: Record<string, any>;
  nodeKey: NodeKey;
}

function CustomBlockComponent(props: CustomBlockComponentProps) {
  const {blocks, onEditBlock} = useCustomBlocks();
  const schemaDef = blocks.get(props.blockName);
  const label = schemaDef?.name || props.blockName;
  const preview = useMemo(() => {
    if (!schemaDef) {
      return undefined;
    }
    return getSchemaPreviewTitle(schemaDef, props.data);
  }, [schemaDef, props.data]);

  return (
    <div className="LexicalEditor__customBlock">
      <div className="LexicalEditor__customBlock__header">{label}</div>
      {preview && (
        <div className="LexicalEditor__customBlock__preview">{preview}</div>
      )}
      {schemaDef && onEditBlock && (
        <div className="LexicalEditor__customBlock__actions">
          <Button
            size="xs"
            variant="light"
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

  constructor(blockName: string, data?: Record<string, any>, key?: NodeKey) {
    super(key);
    this.__blockName = blockName;
    this.__blockData = data ? cloneData(data) : {};
  }

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

  exportJSON(): SerializedCustomBlockNode {
    return {
      type: 'custom-block',
      blockName: this.__blockName,
      data: cloneData(this.__blockData),
      version: 1,
    };
  }

  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.className = 'LexicalEditor__customBlockWrapper';
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  decorate(_: LexicalEditor) {
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
    const writable = this.getWritable<CustomBlockNode>();
    writable.__blockData = cloneData(data);
  }
}

export function $createCustomBlockNode(
  blockName: string,
  data?: Record<string, any>
) {
  return new CustomBlockNode(blockName, data);
}

export function $isCustomBlockNode(
  node: any
): node is CustomBlockNode {
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
