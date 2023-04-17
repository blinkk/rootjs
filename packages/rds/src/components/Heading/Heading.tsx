import {ComponentChildren} from 'preact';

import {Text, FontWeight, TextSize} from '../Text/Text.js';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingComponent = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/**
 * The heading size values are generated from a variable called `$text-sizes` in
 * `tokens.scss`.
 *
 * Example:
 *
 * ```
 * // tokens.scss
 * $text-sizes: (
 *   'title-lg': (
 *     'font-size': 32px,
 *     'line-height': 1.3,
 *     'font-weight': 700,
 *   ),
 * )
 * ```
 */
export type HeadingSize = TextSize;

export type HeadingProps = preact.JSX.HTMLAttributes & {
  level?: HeadingLevel;
  size?: HeadingSize;
  weight?: FontWeight;
  children?: ComponentChildren;
};

/**
 * The `<Heading>` component wraps the `<Text>` component and outputs the
 * appropriate `<h1>`, `<h2>`, etc. tag depending on the `level` prop value.
 */
export function Heading(props: HeadingProps) {
  const {level, size, weight, ...attrs} = props;
  const tagName = `h${level || 1}` as HeadingComponent;
  return (
    <Text {...attrs} as={tagName} size={size} weight={weight}>
      {props.children}
    </Text>
  );
}
