import {ComponentChildren} from 'preact';
import {joinClassNames} from '@/utils/classes.js';
import styles from './Container.module.scss';

export type ContainerProps = preact.JSX.HTMLAttributes & {
  /** The element tagName to render, e.g. "div" or "section". */
  as?: preact.JSX.ElementType;
  /** HTML attrs to pass through to the element. */
  // attrs?: preact.JSX.HTMLAttributes & preact.JSX.IntrinsicAttributes;
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
  const {as: tagName, size, children, className, ...attrs} = props;
  const Component = tagName || 'div';
  return (
    <Component
      {...attrs}
      className={joinClassNames(
        props.className,
        styles.container,
        size && `container:${size}`
      )}
    >
      {props.children}
    </Component>
  );
}
