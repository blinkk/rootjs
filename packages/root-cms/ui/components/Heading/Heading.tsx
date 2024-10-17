import {ComponentChildren} from 'preact';
import {joinClassNames} from '@/utils/classes.js';
import './Heading.css';

export interface HeadingProps {
  className?: string;
  as?: preact.JSX.ElementType;
  size?: 'h1' | 'h2' | 'h3' | 'h4';
  weight?: 'regular' | 'semi-bold' | 'bold';
  color?: 'gray' | 'dark';
  children?: ComponentChildren;
}

export function Heading(props: HeadingProps) {
  const {
    className,
    as: tagName,
    size,
    weight,
    color,
    children,
    ...attrs
  } = props;
  const Component = tagName || 'h2';
  return (
    <Component
      {...attrs}
      className={joinClassNames(
        className,
        'heading',
        size && `size:${size}`,
        weight && `weight:${weight}`,
        color && `color:${color}`
      )}
    >
      {children}
    </Component>
  );
}
