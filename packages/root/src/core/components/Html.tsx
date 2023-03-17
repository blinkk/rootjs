import {ComponentChildren, FunctionalComponent, createContext} from 'preact';
import {useContext} from 'preact/hooks';

export interface HtmlContext {
  htmlAttrs: preact.JSX.HTMLAttributes<HTMLHtmlElement>;
  headAttrs: preact.JSX.HTMLAttributes<HTMLHeadElement>;
  headComponents: ComponentChildren[];
  bodyAttrs: preact.JSX.HTMLAttributes<HTMLBodyElement>;
  scriptDeps: Array<preact.JSX.HTMLAttributes<HTMLScriptElement>>;
}

export const HTML_CONTEXT = createContext<HtmlContext | null>(null);

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
export const Html: FunctionalComponent<HtmlProps> = ({children, ...attrs}) => {
  const context = useContext(HTML_CONTEXT);
  if (!context) {
    throw new Error(
      'HTML_CONTEXT not found, double-check usage of the <Html> component'
    );
  }
  context.htmlAttrs = attrs;
  return <>{children}</>;
};
