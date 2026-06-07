import path from 'node:path';
import {ComponentChildren, FunctionalComponent} from '@blinkk/root/jsx';
import {RichTextContext} from '@blinkk/root-cms/richtext';
import {buildModuleInfo, ModuleInfoContext} from '@/hooks/useModuleInfo.js';
import {RootNode} from '../RootNode/RootNode.js';

const BLOCKS_MODULES = import.meta.glob('/blocks/*/*.tsx', {
  eager: true,
});
const BLOCKS: Record<string, FunctionalComponent> = {};
Object.keys(BLOCKS_MODULES).forEach((modulePath) => {
  const module = BLOCKS_MODULES[modulePath] as any;
  if (!module) {
    return;
  }
  const type = path.basename(modulePath).split('.')[0];
  if (module[type]) {
    BLOCKS[type] = module[type] as FunctionalComponent;
  }
});

export type BlockProps = {
  [key: string]: any;
  _type: string;
};

interface RichTextBlocksProviderProps {
  children?: ComponentChildren;
  components?: any;
}

export function RichTextBlocksProvider(props: RichTextBlocksProviderProps) {
  const components: any = {};
  Object.entries(BLOCKS).map(([blockType, fn]) => {
    // Destructure {type: <name>, data: <props>}.
    const Component: any = fn;
    components[blockType] = ({data}: any) => (
      <Component className={blockType} {...data} />
    );
  });
  return (
    <RichTextContext.Provider
      value={{components: {...components, ...props.components}}}
    >
      {props.children}
    </RichTextContext.Provider>
  );
}

export default function Block(props: BlockProps & {fieldKey?: string}) {
  if (!props._type) {
    return null;
  }
  const Component = BLOCKS[props._type];
  if (!Component) {
    return <h2>{`Not found: ${props._type}`}</h2>;
  }
  return (
    <ModuleInfoContext.Provider value={buildModuleInfo(props, props.fieldKey)}>
      <RootNode>
        <Component {...(props as any)} />
      </RootNode>
    </ModuleInfoContext.Provider>
  );
}
