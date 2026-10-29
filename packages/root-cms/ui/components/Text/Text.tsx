import './Text.css';

import {ComponentChildren} from 'preact';
import {cn} from '../../utils/classes.js';

export interface TextProps {
  className?: string;
  /** The element to render. Default `div`. */
  as?: preact.JSX.ElementType;
  /** `body-sm` 12px, `body` 14px (default), `body-lg` 16px. */
  size?: 'body' | 'body-sm' | 'body-lg';
  /** Default `regular`. `semi-bold` is 500. */
  weight?: 'regular' | 'semi-bold' | 'bold';
  /** Default: the body text color. `gray` is muted. */
  color?: 'gray' | 'dark';
  children?: ComponentChildren;
  [key: string]: any;
}

const SIZE_CLASSES = {
  'body-sm': 'text-sm',
  body: 'text-base',
  'body-lg': 'text-lg',
};

const WEIGHT_CLASSES = {
  regular: 'font-normal',
  'semi-bold': 'font-medium',
  bold: 'font-bold',
};

/** Body text on the type scale. Inline `<code>` gets a chip style. */
export function Text(props: TextProps) {
  const {
    className,
    as: tagName,
    size = 'body',
    weight = 'regular',
    color,
    children,
    ...attrs
  } = props;
  const Component = tagName || 'div';
  return (
    <Component
      {...attrs}
      className={cn(
        'Text',
        `Text--size-${size}`,
        'leading-normal',
        SIZE_CLASSES[size],
        WEIGHT_CLASSES[weight],
        color === 'gray' ? 'text-muted' : 'text-fg',
        className
      )}
    >
      {children}
    </Component>
  );
}
