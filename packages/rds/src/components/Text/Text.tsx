import {ComponentChildren} from 'preact';

import {joinClassNames} from '../../utils/classes.js';

import styles from './Text.module.scss';

export type FontWeight =
  | 'thin'
  | 'extra-light'
  | 'light'
  | 'normal'
  | 'regular'
  | 'semi-bold'
  | 'bold'
  | 'extra-bold'
  | 'black';

export type TextProps = preact.JSX.HTMLAttributes & {
  /** HTML tagName to use. */
  as?: preact.JSX.ElementType;
  size?: string;
  weight?: FontWeight;
  children?: ComponentChildren;
};

/**
 * The `<Text>` component applies typography styles to an element.
 *
 * The text sizes can be configured by defining a `tokens.scss` file with a
 * configuration map called `$text-sizes`. For example:
 *
 * ```
 * // tokens.scss
 * $text-sizes: (
 *   'body-lg': (
 *     'font-size': 1rem,
 *     'line-height': 1.5
 *   ),
 * );
 * ```
 *
 * After configuring `$text-sizes` in `tokens.scss`, the size should be usable
 * within the component, e.g.:
 *
 * ```
 * <Text size="body-lg">Lorem ipsum.</Text>
 * ```
 */
export function Text(props: TextProps) {
  const {as: tagName, size: sizeProp, weight, children, ...attrs} = props;
  const Component = tagName || 'div';
  const size = sizeProp || 'body';
  if (import.meta.env.DEV && !styles[`size:${size}`]) {
    throw new Error(`<Text> size="${size}" is not configured`);
  }
  return (
    <Component
      {...attrs}
      className={joinClassNames(
        props.className,
        styles[`size:${size}`],
        weight && styles[`weight:${weight}`]
      )}
    >
      {children}
    </Component>
  );
}
