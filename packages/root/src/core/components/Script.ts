import {FunctionalComponent} from 'preact';
import {useContext} from 'preact/hooks';
import {HTML_CONTEXT} from './Html.js';

export type ScriptProps = preact.JSX.HTMLAttributes<HTMLScriptElement> & {
  // Cast the "src" attr to string. See:
  // https://github.com/blinkk/rootjs/issues/519
  src?: string;
};

/**
 * The <Script> component is used for rendering any custom script modules. At
 * the moment, the system only pre-renders and bundles files that are in the
 * `/bundles` folder at the root of the project.
 *
 * Usage:
 *
 * ```tsx
 * <Script src="/bundles/main.ts" />
 * ```
 */
export const Script: FunctionalComponent<ScriptProps> = (props) => {
  const context = useContext(HTML_CONTEXT);
  if (!context) {
    throw new Error(
      'HTML_CONTEXT not found, double-check usage of the <Script> component'
    );
  }
  context.scriptDeps.push(props);
  return null;
};
