import {useRequestContext} from '@blinkk/root';
import {useModuleInfo} from '@/hooks/useModuleInfo.js';

export function NodeEditor() {
  const ctx = useRequestContext();
  if (!ctx.props.req?.query?.preview) {
    return null;
  }
  const moduleInfo = useModuleInfo();
  return (
    <root-node-editor data-deep-key={moduleInfo.deepKey}>
      <button data-slot="button">Edit</button>
    </root-node-editor>
  );
}
