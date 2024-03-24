import {ComponentChildren} from 'preact';
import {joinClassNames} from '@/utils/classes.js';
import styles from './Text.module.scss';

export type FontWeight =
  | 'thin'
  | 'extra-light'
  | 'light'
  | 'normal'
  | 'regular'
  | 'medium'
  | 'semi-bold'
  | 'bold'
  | 'extra-bold'
  | 'black';

/**
 * The text size values are generated from a variable called `$text-sizes` in
 * `tokens.scss`.
 *
 * Example:
 *
 * ```
 * // tokens.scss
 * $text-sizes: (
 *   'body': (
 *     'font-size': 16px,
 *     'line-height': 1.5,
 *   ),
 *   'body-lg': (
 *     'font-size': 18px,
 *     'line-height': 1.5,
 *   ),
 * )
 * ```
 */
export type TextSize = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'small';

export type TextProps = Omit<preact.JSX.HTMLAttributes, 'size'> & {
  /** HTML tagName to use. */
  as?: preact.JSX.ElementType;
  /** Text size as configured in `tokens.$text-sizes`. */
  size: TextSize;
  weight?: FontWeight;
  markdown?: boolean;
  uppercase?: boolean;
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
  const {
    as: tagName,
    size: sizeProp,
    weight,
    markdown,
    uppercase,
    children,
    ...attrs
  } = props;
  const Component: preact.JSX.ElementType = tagName || 'div';
  const size = sizeProp || 'body';
  if (import.meta.env.DEV && !styles[`size:${size}`]) {
    throw new Error(`<Text size="${size}"> is not configured`);
  }
  return (
    <Component
      {...attrs}
      className={joinClassNames(
        props.className as string,
        styles[`size:${size}`],
        weight && styles[`weight:${weight}`],
        markdown && styles.markdown,
        uppercase && styles.uppercase
      )}
      // dangerouslySetInnerHTML={{
      //   ...(markdown && {
      //     __html: markdownToHtml(String(children)),
      //   }),
      // }}
    >
      {!markdown && children}
    </Component>
  );
}
