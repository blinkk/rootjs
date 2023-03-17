import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {Route} from '../types';

export interface RequestContext {
  /** The route file. */
  route: Route;
  /**
   * Route param values. E.g. for a route like `routes/blog/[slug].tsx`,
   * visiting `/blog/foo` will pass {slug: 'foo'} here.
   */
  routeParams: Record<string, string>;
  /** Props passed to the route's server component. */
  props: any;
  /** The current locale. */
  locale: string;
  /** Translations map for the current locale. */
  translations: Record<string, string>;
}

export const REQUEST_CONTEXT = createContext<RequestContext | null>(null);

/**
 * A hook that returns information about the current route.
 *
 * Usage:
 *
 * ```ts
 * const ctx = useRequestContext();
 * ctx.route.src;
 * // => 'routes/index.tsx'
 * ```
 */
export function useRequestContext() {
  const context = useContext(REQUEST_CONTEXT);
  if (!context) {
    throw new Error('REQUEST_CONTEXT not found');
  }
  return context;
}
