import {ComponentChildren, createContext} from 'preact';
import {useContext} from 'preact/hooks';

export interface HtmlContext {
  htmlAttrs: preact.JSX.HTMLAttributes<HTMLHtmlElement>;
  bodyAttrs: preact.JSX.HTMLAttributes<HTMLBodyElement>;
  scriptDeps: Array<preact.JSX.HTMLAttributes<HTMLScriptElement>>;
}

export const HTML_CONTEXT = createContext<HtmlContext>({
  htmlAttrs: {},
  bodyAttrs: {},
  scriptDeps: [],
});

export type HtmlProps = preact.JSX.HTMLAttributes<HTMLHtmlElement> & {
  children?: ComponentChildren;
};

/**
 * The `<Html>` component can be used to update attrs in the `<html>` tag.
 *
 * Usage:
 *
 * ```tsx
 * <Html lang="en-US">
 *   <h1>Hello world</h1>
 * </Html>
 * ```
 */
export function Html({children, ...attrs}: HtmlProps) {
  let context: HtmlContext;
  try {
    context = useContext(HTML_CONTEXT);
    context.htmlAttrs = attrs;
  } catch (err) {
    console.error(err.stack || err);
    throw new Error(
      'HTML_CONTEXT not found, double-check usage of the <Html> component',
      {cause: err}
    );
  }
  return <>{children}</>;
}
