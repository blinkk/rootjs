import {ComponentChildren, createContext, FunctionalComponent} from 'preact';
import {useContext} from 'preact/hooks';

export const HEAD_CONTEXT = createContext<ComponentChildren[]>([]);

export interface HeadProps {
  children?: ComponentChildren;
}

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
export const Head: FunctionalComponent<HeadProps> = (props) => {
  let context: ComponentChildren[];
  try {
    context = useContext(HEAD_CONTEXT);
    context.push(props.children);
  } catch (err) {
    console.error(err.stack || err);
    throw new Error(
      'HEAD_CONTEXT not found, double-check usage of the <Head> component',
      {cause: err}
    );
  }
  return null;
};
