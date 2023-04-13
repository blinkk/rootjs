import {ComponentChildren} from 'preact';
import {joinClassNames} from '@/utils/classes.js';
import styles from './Text.module.scss';

export type TextSize = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body-sm' | 'body' | 'body-lg';
export type TextWeight = 'regular' | 'semi-bold' | 'bold';

export interface TextProps {
  id?: string;
  className?: string;
  /** HTML tagName to use. */
  as?: preact.JSX.ElementType;
  size?: TextSize;
  weight?: TextWeight;
  children?: ComponentChildren;
}

export function Text(props: TextProps) {
  const Component = props.as || 'div';
  const size = props.size || 'md';
  return (
    <Component
      id={props.id}
      className={joinClassNames(
        props.className,
        styles.text,
        styles[`size:${size}`],
        props.weight && styles[`weight:${props.weight}`]
      )}
    >
      {props.children}
    </Component>
  );
}
