import path from 'node:path';
import {FunctionalComponent} from 'preact';

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

export default function Block(props: BlockProps) {
  if (!props._type) {
    return null;
  }
  const Component = blocks[props._type];
  if (!Component) {
    return <h2>{`Not found: ${props._type}`}</h2>;
  }
  return <Component {...(props as any)} />;
}
