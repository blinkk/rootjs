import path from 'node:path';
import {FunctionalComponent} from 'preact';
import {buildModuleInfo, ModuleInfoContext} from '@/hooks/useModuleInfo.js';
import {NodeEditor} from '../NodeEditor/NodeEditor.js';

const blockModules = import.meta.glob('/blocks/*/*.tsx', {
  eager: true,
});
const blocks: Record<string, FunctionalComponent> = {};
Object.keys(blockModules).forEach((modulePath) => {
  const module = blockModules[modulePath] as any;
  if (!module) {
    return;
  }
  const type = path.basename(modulePath).split('.')[0];
  if (module[type]) {
    blocks[type] = module[type] as FunctionalComponent;
  }
});

export type BlockProps = {
  [key: string]: any;
  _type: string;
};

export default function Block(props: BlockProps & {fieldKey?: string}) {
  if (!props._type) {
    return null;
  }
  const Component = blocks[props._type];
  if (!Component) {
    return <h2>{`Not found: ${props._type}`}</h2>;
  }
  return (
    <ModuleInfoContext.Provider value={buildModuleInfo(props, props.fieldKey)}>
      <NodeEditor.Overlay>
        <Component {...(props as any)} />
      </NodeEditor.Overlay>
    </ModuleInfoContext.Provider>
  );
}
