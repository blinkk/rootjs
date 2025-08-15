import {ComponentChildren} from 'preact';
import {joinDeepKey, useModuleInfo} from '@/hooks/useModuleInfo.js';
import {testPreviewMode, getQueryParam} from '@/utils/mode.js';
import styles from './RootNode.module.scss';

/**
 * A utility component for supporting visual/in-context editing. A wrapper
 * element that represents the UI constructed from a specific field in the CMS.
 * When the page is being rendered within the CMS preview iframe, the
 * `RootNode` becomes clickable. When clicking on a node, a message is sent to
 * the CMS requesting that the field associated with the node becomes
 * highlighted.
 */
export function RootNode(props: {fieldKey?: string; children: any}) {
  // Do nothing outside of the embedded CMS preview.
  if (!testPreviewMode() || !getQueryParam('embed')) {
    return props.children;
  }
  const moduleInfo = useModuleInfo();
  return (
    <root-node data-deep-key={joinDeepKey(moduleInfo.deepKey, props?.fieldKey)}>
      <div className={styles.node}>
        <div
          role="button"
          title="Edit in CMS"
          className={styles.nodeButton}
          data-slot="button"
        ></div>
        {props.children}
      </div>
    </root-node>
  );
}

/** Convenience function for creating a `RootNode` around some other components. */
export function node(fieldKey: string, children: ComponentChildren) {
  return <RootNode fieldKey={fieldKey}>{children}</RootNode>;
}
