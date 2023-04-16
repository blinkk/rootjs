import {ComponentChildren} from 'preact';

import {joinClassNames} from '@/utils/classes.js';

import {Text, TextSize} from '../Text/Text.js';

export type HeadingSize = 1 | 2 | 3 | 4 | 5 | 6;
type HeadingComponent = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export interface HeadingProps {
  id?: string;
  className?: string;
  level?: HeadingSize;
  size?: HeadingSize;
  children?: ComponentChildren;
}

export function Heading(props: HeadingProps) {
  const level = props.level || props.size || 2;
  const tagName = `h${level}` as HeadingComponent;
  const size = props.size || props.level || 2;
  const textSize = `h${size}` as TextSize;
  return (
    <Text
      as={tagName}
      id={props.id}
      className={joinClassNames(props.className)}
      size={textSize}
    >
      {props.children}
    </Text>
  );
}
