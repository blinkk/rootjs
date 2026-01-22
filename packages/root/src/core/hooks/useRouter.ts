import {useRequestContext} from './useRequestContext.js';

/**
 * A hook that returns the current route and params.
 */
export function useRouter() {
  const context = useRequestContext();
  return {
    route: context.route,
    params: context.routeParams,
  };
}
