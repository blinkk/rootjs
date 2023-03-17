import {ComponentChildren} from 'preact';
import {joinClassNames} from '../../utils/classes.js';
import './Text.css';

export interface TextProps {
  className?: string;
  as?: preact.JSX.ElementType;
  size?: 'body' | 'body-sm' | 'body-lg';
  weight?: 'regular' | 'semi-bold' | 'bold';
  color?: 'gray' | 'dark';
  children?: ComponentChildren;
}

export function Text(props: TextProps) {
  const {
    className,
    as: tagName,
    size,
    weight,
    color,
    children,
    ...attrs
  } = props;
  const Component = tagName || 'div';
  return (
    <Component
      {...attrs}
      className={joinClassNames(
        className,
        'text',
        size && `size:${size}`,
        weight && `weight:${weight}`,
        color && `color:${color}`
      )}
    >
      {children}
    </Component>
  );
}
