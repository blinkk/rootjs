import {ComponentChildren} from 'preact';

import {joinClassNames} from '@/utils/classes.js';

import styles from './Container.module.scss';

export type ContainerProps = preact.JSX.HTMLAttributes & {
  /** The element tagName to render, e.g. "div" or "section". */
  as?: preact.JSX.ElementType;
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
};

/**
 * The <Container> component is responsible for setting the left/right padding
 * of an element aligned with respect to the grid.
 */
export function Container(props: ContainerProps) {
  const {as: tagName, size, children, className, ...attrs} = props;
  const Component = tagName || 'div';
  return (
    <Component
      {...attrs}
      className={joinClassNames(
        className,
        styles.container,
        size && styles[`size:${size}`]
      )}
    >
      {children}
    </Component>
  );
}
