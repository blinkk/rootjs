import {ComponentChildren} from 'preact';
import {joinDeepKey, useModuleInfo} from '@/hooks/useModuleInfo.js';
import {testPreviewMode, testQueryParam} from '@/utils/mode.js';
import styles from './NodeEditor.module.scss';

/** An "Edit" button that sends a message to the DocEditor to focus the selected node. */
export function NodeEditor(props?: {fieldKey?: string}) {
  if (!testPreviewMode() || !testQueryParam('embed')) {
    return null;
  }
  const moduleInfo = useModuleInfo();
  return (
    <root-node-editor
      data-deep-key={joinDeepKey(moduleInfo.deepKey, props?.fieldKey)}
    >
      <button data-slot="button">Edit</button>
    </root-node-editor>
  );
}

/** An overlay that wraps around children and serves as a target for the edit button. */
NodeEditor.Overlay = (props: {fieldKey?: string; children: any}) => {
  if (!testPreviewMode() || !testQueryParam('embed')) {
    return props.children;
  }
  const moduleInfo = useModuleInfo();
  return (
    <root-node-editor
      data-deep-key={joinDeepKey(moduleInfo.deepKey, props?.fieldKey)}
    >
      <div className={styles.overlay}>
        <div
          className={styles.overlayButton}
          data-slot="button"
          title="Edit in CMS"
        ></div>
        {props.children}
      </div>
    </root-node-editor>
  );
};

/** Convenience function for creating a NodeEditor overlay. */
export function n(fieldKey: string, children: ComponentChildren) {
  return (
    <NodeEditor.Overlay fieldKey={fieldKey}>{children}</NodeEditor.Overlay>
  );
}
