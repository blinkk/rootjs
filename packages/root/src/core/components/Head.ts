import {ComponentChildren, FunctionalComponent} from 'preact';
import {useContext} from 'preact/hooks';

import {HTML_CONTEXT} from './Html';

export type HeadProps = preact.JSX.HTMLAttributes<HTMLHeadElement> & {
  children?: ComponentChildren;
};

/**
 * The <Head> component can be used for injecting elements into the HTML head
 * tag from any part of a page. The <Head> can be added via any component or
 * sub-component and will automatically be hoisted to the `<head>` element.
 *
 * Usage:
 *
 * ```tsx
 * <Head>
 *   <link rel="preconnect" href="https://fonts.googleapis.com" />
 * </Head>
 * ```
 */
export const Head: FunctionalComponent<HeadProps> = ({children, ...attrs}) => {
  const context = useContext(HTML_CONTEXT);
  if (!context) {
    throw new Error(
      'HTML_CONTEXT not found, double-check usage of the <Head> component'
    );
  }
  context.headComponents.push(children);
  context.headAttrs = attrs;
  return null;
};
