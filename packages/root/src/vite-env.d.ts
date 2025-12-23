/// <reference types="vite/client" />

declare module 'virtual:root-plugin-routes' {
  const routes: Record<
    string,
    {module: import('./core/types.js').RouteModule; src: string}
  >;
  export default routes;
}
