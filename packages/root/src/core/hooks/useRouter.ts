import {useRequestContext} from './useRequestContext.js';

/**
 * A hook that returns the current route and route parameters.
 *
 * This is useful for plugin routes that need to access dynamic route parameters.
 *
 * @example
 * ```tsx
 * // In a route component:
 * export default function ProductPage() {
 *   const router = useRouter();
 *   const { id } = router.params;
 *   return <h1>Product: {id}</h1>;
 * }
 * ```
 */
export function useRouter() {
  const context = useRequestContext();
  return {
    route: context.route,
    params: context.routeParams,
  };
}
