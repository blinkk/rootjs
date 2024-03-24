import {ComponentChildren} from 'preact';
import {joinClassNames} from '@/utils/classes.js';
import styles from './Container.module.scss';

export type ContainerProps = preact.JSX.HTMLAttributes & {
  /** HTML tagName to use. */
  as?: preact.JSX.ElementType;
  className?: string;
  children?: ComponentChildren;
};

/**
 * The `<Container>` component applies left/right padding to align content to
 * the grid system.
 */
export function Container(props: ContainerProps) {
  const {as: tagName, className, children, ...attrs} = props;
  const Component: preact.JSX.ElementType = tagName || 'div';
  return (
    <Component
      {...attrs}
      className={joinClassNames(className, styles.container)}
    >
      {children}
    </Component>
  );
}
