import {FunctionalComponent} from 'preact';
import {useContext} from 'preact/hooks';
import {HTML_CONTEXT} from './Html.js';

export interface StyleDepsProps {
  /**
   * Source path of a component whose CSS deps should be injected into the page,
   * relative to the project root (e.g. `templates/Foo/Foo.tsx`).
   */
  src: string;
}

/**
 * The `<StyleDeps>` component registers a component's CSS deps for injection
 * into the page `<head>`, even when the component is imported dynamically.
 *
 * Root normally collects CSS by walking a route's *static* import graph, so the
 * `.module.scss` of a dynamically-imported (`import()`) component is never
 * linked. Rendering `<StyleDeps src="...">` alongside such a component tells
 * Root to resolve that source file's CSS deps (via the asset map) and inject
 * them, so a page loads only the CSS for the components it actually renders.
 *
 * Usage:
 *
 * ```tsx
 * <StyleDeps src="templates/Foo/Foo.tsx" />
 * ```
 */
export const StyleDeps: FunctionalComponent<StyleDepsProps> = (props) => {
  const context = useContext(HTML_CONTEXT);
  if (!context) {
    throw new Error(
      'HTML_CONTEXT not found, double-check usage of the <StyleDeps> component'
    );
  }
  if (props.src) {
    context.styleDeps.push(props.src);
  }
  return null;
};
