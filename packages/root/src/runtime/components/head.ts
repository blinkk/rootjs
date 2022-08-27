import {ComponentChildren, createContext} from 'preact';
import {useContext} from 'preact/hooks';

export const HEAD_CONTEXT = createContext<ComponentChildren[]>([]);

export interface HeadProps {
  children: ComponentChildren;
}

/**
 * The <Head> component can be used for injecting elements into the HTML head
 * tag from any part of a page.
 */
export function Head(props: HeadProps) {
  let context: ComponentChildren[];
  try {
    context = useContext(HEAD_CONTEXT);
  } catch (err) {
    console.log(err);
    throw new Error(
      '<Head> component is not supported in the browser, or during suspense renders.',
      {cause: err}
    );
  }
  context.push(props.children);
  return null;
}
