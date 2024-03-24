import {CSSProperties} from 'preact/compat';
import {SpacerFields} from '@/root-cms.js';
import styles from './Spacer.module.scss';

export function Spacer(props: SpacerFields) {
  const style: CSSProperties = {};
  style['--spacer-height--lg-gt'] = `${props.desktopHeight || '0'}px`;
  style['--spacer-height--md'] = `${
    props.tabletHeight || props.desktopHeight || '0'
  }px`;
  style['--spacer-height--sm'] = `${
    props.mobileHeight || props.tabletHeight || props.desktopHeight || '0'
  }px`;
  return (
    <div
      className={styles.spacer}
      role="separator"
      aria-hidden="true"
      style={style}
    />
  );
}
