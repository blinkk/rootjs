import {ComponentChildren, createContext, FunctionalComponent} from 'preact';
import {useContext} from 'preact/hooks';

export interface HtmlContextValue {
  attrs: preact.JSX.HTMLAttributes<HTMLHtmlElement>;
}

export const HTML_CONTEXT = createContext<HtmlContextValue>({attrs: {}});

export type HtmlProps = preact.JSX.HTMLAttributes<HTMLHtmlElement> & {
  children?: ComponentChildren;
};

/**
 * The `<Html>` component can be used to update attrs used in the `<html>` tag.
 *
 * Usage:
 *
 * import {Html} from '@blinkk/root';
 *
 * export default function Page() {
 *   return (
 *     <Html lang={locale}>
 *       <h1>Hello world</h1>
 *     </Html>
 *   );
 * }
 */
export const Html: FunctionalComponent<HtmlProps> = ({children, ...attrs}) => {
  let context: HtmlContextValue;
  try {
    context = useContext(HTML_CONTEXT);
    context.attrs = attrs;
  } catch (err) {
    console.log(err);
    throw new Error(
      '<Html> component is not supported in the browser, or during suspense renders.',
      {cause: err}
    );
  }
  return <>{children}</>;
};
