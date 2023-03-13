import {ComponentChildren} from 'preact';
import {joinClassNames} from '@/utils/classes.js';
import styles from './Container.module.scss';

export interface ContainerProps {
  /**
   * The container width.
   * default: 12 cols
   * wide: 10 cols
   * content: 8 cols
   * narrow: 6 cols
   */
  size?: 'default' | 'wide' | 'content' | 'narrow';
  children?: ComponentChildren;
  className?: string;
}

/**
 * The <Container> component is responsible for setting the left/right padding
 * of an element aligned with respect to the grid.
 */
export function Container(props: ContainerProps) {
  const size = props.size || 'default';
  return (
    <div
      className={joinClassNames(
        props.className,
        styles.container,
        `size:${size}`
      )}
    >
      {props.children}
    </div>
  );
}
