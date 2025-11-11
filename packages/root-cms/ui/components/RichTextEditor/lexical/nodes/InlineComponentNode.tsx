import {DecoratorNode} from 'lexical';
import {NodeKey, SerializedLexicalNode, Spread} from 'lexical';
import {JSX, MouseEvent, useCallback} from 'preact/compat';
import {joinClassNames} from '../../../../utils/classes.js';
import {cloneData} from '../../../../utils/objects.js';
import {useInlineComponents} from '../hooks/useInlineComponents.js';

interface InlineComponentProps {
  componentName: string;
  componentId: string;
  data: Record<string, any>;
  nodeKey: NodeKey;
}

function InlineComponent(props: InlineComponentProps) {
  const {componentName, componentId, nodeKey} = props;
  const {components, onEditComponent} = useInlineComponents();
  const schemaDef = components.get(componentName);
  const label = schemaDef?.label || schemaDef?.name || componentName;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!onEditComponent) {
        return;
      }
      onEditComponent(componentName, {
        componentId,
        initialValue: props.data,
        mode: 'edit',
        nodeKey,
      });
    },
    [componentName, componentId, nodeKey, onEditComponent, props.data]
  );

  return (
    <span
      className="LexicalEditor__inlineComponent"
      data-node-key={nodeKey}
      contentEditable={false}
    >
      <button
        type="button"
        className={joinClassNames(
          'LexicalEditor__inlineComponent__button',
          !onEditComponent && 'LexicalEditor__inlineComponent__button--disabled'
        )}
        onClick={onEditComponent ? handleClick : undefined}
        title={label ? `${label} (${componentId})` : componentId}
        contentEditable={false}
      >
        <span className="LexicalEditor__inlineComponent__label">{label}</span>
        <span className="LexicalEditor__inlineComponent__id">
          {componentId}
        </span>
      </button>
    </span>
  );
}

export type SerializedInlineComponentNode = Spread<
  {
    type: 'inline-component';
    componentName: string;
    componentId: string;
    data: Record<string, any>;
    version: 1;
  },
  SerializedLexicalNode
>;

export class InlineComponentNode extends DecoratorNode<JSX.Element> {
  __componentName: string;
  __componentId: string;
  __componentData: Record<string, any>;

  static getType(): string {
    return 'inline-component';
  }

  static clone(node: InlineComponentNode) {
    return new InlineComponentNode(
      node.__componentName,
      node.__componentId,
      node.__componentData,
      node.__key
    );
  }

  static importJSON(serializedNode: SerializedInlineComponentNode) {
    const {componentName, componentId, data} = serializedNode;
    return new InlineComponentNode(componentName, componentId, data);
  }

  exportJSON(): SerializedInlineComponentNode {
    return {
      ...super.exportJSON(),
      type: 'inline-component',
      componentName: this.__componentName,
      componentId: this.__componentId,
      data: cloneData(this.__componentData),
      version: 1,
    };
  }

  constructor(
    componentName: string,
    componentId: string,
    data?: Record<string, any>,
    key?: NodeKey
  ) {
    super(key);
    this.__componentName = componentName;
    this.__componentId = componentId;
    this.__componentData = data ? cloneData(data) : {};
  }

  createDOM(): HTMLElement {
    const dom = document.createElement('span');
    dom.className = 'LexicalEditor__inlineComponentWrapper';
    dom.contentEditable = 'false';
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  isIsolated(): boolean {
    return true;
  }

  decorate(): JSX.Element {
    return (
      <InlineComponent
        componentName={this.__componentName}
        componentId={this.__componentId}
        data={this.__componentData}
        nodeKey={this.__key}
      />
    );
  }

  getComponentName() {
    return this.__componentName;
  }

  setComponentName(componentName: string) {
    const writable = this.getWritable();
    writable.__componentName = componentName;
  }

  getComponentId() {
    return this.__componentId;
  }

  setComponentId(componentId: string) {
    const writable = this.getWritable();
    writable.__componentId = componentId;
  }

  getComponentData() {
    return this.__componentData;
  }

  setComponentData(data: Record<string, any>) {
    const writable = this.getWritable();
    writable.__componentData = cloneData(data);
  }
}

export function $createInlineComponentNode(
  componentName: string,
  componentId: string,
  data?: Record<string, any>
) {
  return new InlineComponentNode(componentName, componentId, data);
}

export function $isInlineComponentNode(node: any): node is InlineComponentNode {
  return node instanceof InlineComponentNode;
}
