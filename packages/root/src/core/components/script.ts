import {createContext} from 'preact';
import {useContext} from 'preact/hooks';

export const SCRIPT_CONTEXT = createContext<ScriptProps[]>([]);

export interface ScriptProps {
  src: string;
  type?: string;
}

/**
 * The <Script> component is used for rendering any custom script modules. At
 * the moment, the system only pre-renders and bundles files that are in the
 * `/bundles` folder at the root of the project.
 */
export function Script(props: ScriptProps) {
  let context: ScriptProps[];
  try {
    context = useContext(SCRIPT_CONTEXT);
  } catch (err) {
    throw new Error(
      '<Script> component is not supported in the browser, or during suspense renders.',
      {cause: err}
    );
  }
  if (!Object.isFrozen(context)) {
    context.push(props);
  }
  return null;
}
