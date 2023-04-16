import {ComponentChildren} from 'preact';

import {joinClassNames} from '@/utils/classes.js';

import styles from './Text.module.scss';

export type TextSize =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'body-sm'
  | 'body'
  | 'body-lg';
export type TextWeight = 'regular' | 'semi-bold' | 'bold';

export type TextProps = preact.JSX.HTMLAttributes & {
  id?: string;
  className?: string;
  /** HTML tagName to use. */
  as?: preact.JSX.ElementType;
  size?: TextSize;
  weight?: TextWeight;
  children?: ComponentChildren;
};

export function Text(props: TextProps) {
  const {as: tagName, size, weight, children, ...attrs} = props;
  const Component = tagName || 'div';
  return (
    <Component
      {...attrs}
      className={joinClassNames(
        props.className,
        styles.text,
        styles[`size:${size || 'body'}`],
        weight && styles[`weight:${weight}`]
      )}
    >
      {children}
    </Component>
  );
}
