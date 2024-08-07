import {ComponentChildren, FunctionalComponent} from 'preact';
import {useContext} from 'preact/hooks';
import {HTML_CONTEXT} from './Html.js';

export type BodyProps = preact.JSX.HTMLAttributes<HTMLBodyElement> & {
  children?: ComponentChildren;
};

/**
 * The `<Body>` component can be used to update attrs in the `<body>` tag.
 *
 * Usage:
 *
 * ```tsx
 * <Body className="body">
 *   <h1>Hello world</h1>
 * </Body>
 * ```
 *
 * Output:
 *
 * ```html
 * <body class="body">
 *   <h1>Hello world</h1>
 * </body>
 */
export const Body: FunctionalComponent<BodyProps> = ({children, ...attrs}) => {
  const context = useContext(HTML_CONTEXT);
  if (!context) {
    throw new Error(
      'HTML_CONTEXT not found, double-check usage of the <Body> component'
    );
  }
  context.bodyAttrs = attrs;
  return <>{children}</>;
};
