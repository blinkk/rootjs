/// <reference types="vite/client" />

declare module 'virtual:root/routes' {
  import type {RouteModule} from './core/types.js';

  export const ROUTE_MODULES: Record<string, RouteModule>;
  export const POD_ROUTE_MODULES: Record<
    string,
    {
      module: RouteModule;
      podName: string;
      routePath: string;
      src: string;
    }
  >;
}
