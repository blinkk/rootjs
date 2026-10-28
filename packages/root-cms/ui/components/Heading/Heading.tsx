import {ComponentChildren} from 'preact';
import {cn} from '../../utils/classes.js';

export interface HeadingProps {
  className?: string;
  /** The element to render. Default `h2`. */
  as?: preact.JSX.ElementType;
  /** `h1` 24px, `h2` 20px (default), `h3` 16px, `h4` 14px. */
  size?: 'h1' | 'h2' | 'h3' | 'h4';
  /** Default `bold`. `semi-bold` is 500. */
  weight?: 'regular' | 'semi-bold' | 'bold';
  color?: 'gray' | 'dark';
  children?: ComponentChildren;
  [key: string]: any;
}

const SIZE_CLASSES = {
  h1: 'text-2xl',
  h2: 'text-xl',
  h3: 'text-lg',
  h4: 'text-base',
};

const WEIGHT_CLASSES = {
  regular: 'font-normal',
  'semi-bold': 'font-medium',
  bold: 'font-bold',
};

/** A heading on the type scale. */
export function Heading(props: HeadingProps) {
  const {
    className,
    as: tagName,
    size = 'h2',
    weight = 'bold',
    color,
    children,
    ...attrs
  } = props;
  const Component = tagName || 'h2';
  return (
    <Component
      {...attrs}
      className={cn(
        'Heading',
        `Heading--size-${size}`,
        'm-0 leading-tight',
        SIZE_CLASSES[size],
        WEIGHT_CLASSES[weight],
        color === 'gray' && 'text-muted',
        color === 'dark' && 'text-fg',
        className
      )}
    >
      {children}
    </Component>
  );
}
