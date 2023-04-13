import {CSSProperties} from 'preact/compat';
import {SpacerFields} from '@/root-cms.js';
import styles from './Spacer.module.scss';

export function Spacer(props: SpacerFields) {
  const inlineStyles: CSSProperties = {};
  if (props.mobileHeight) {
    inlineStyles['--spacer-size--mobile'] = `${props.mobileHeight}px`;
  }
  if (props.tabletHeight) {
    inlineStyles['--spacer-size--tablet'] = `${props.tabletHeight}px`;
  }
  if (props.desktopHeight) {
    inlineStyles['--spacer-size--desktop'] = `${props.desktopHeight}px`;
  }
  return (
    <div
      className={styles.spacer}
      role="separator"
      aria-hidden="true"
      style={inlineStyles}
    />
  );
}
