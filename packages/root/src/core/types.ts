import {
  Express,
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction as ExpressNextFunction,
} from 'express';
import {ComponentType} from 'preact';
import {ViteDevServer} from 'vite';

import {Renderer} from '../render/render';

import {RootConfig} from './config';

/**
 * Param values from the route, e.g. a route like `/route/[slug].tsx` will pass
 * `{slug: 'foo'}`.
 */
export type RouteParams = Record<string, string>;

/**
 * The `getStaticProps()` function is an optional function that routes can
 * define to fetch and transform props before passing it to the route's
 * component.
 */
export type GetStaticProps<T = unknown> = (ctx: {
  rootConfig: RootConfig;
  params: RouteParams;
}) => Promise<{
  /** Props to pass to the component. */
  props?: T;
  /** The rendered locale. */
  locale?: string;
  /**  Set to true if the route should result in a 404 page. */
  notFound?: boolean;
}>;

/**
 * The `getStaticPaths()` is used by the SSG build to determine all of the
 * paths that should exist for a given route. This should be used alongside a
 * parameterized route, e.g. `/routes/blog/[slug].tsx`.
 */
export type GetStaticPaths<T = RouteParams> = () => Promise<{
  paths: Array<{params: T}>;
}>;

/** Root.js express app. */
export type Server = Express;

/** Root.js express request. */
export type Request = ExpressRequest & {
  /** The root.js project config. */
  rootConfig?: RootConfig & {rootDir: string};
  /** The vite dev server. This is only available when running `root dev`. */
  viteServer?: ViteDevServer;
  /** The root.js renderer, to render routes within middleware. */
  renderer?: Renderer;
  /**
   * Handler context, provided to route files that export a custom `handler()`
   * function.
   */
  handlerContext?: HandlerContext;
};

/** Root.js express response. */
export type Response = ExpressResponse;

/** Root.js express next function. */
export type NextFunction = ExpressNextFunction;

/**
 * A context variable passed to a route's `handle()` method within the req
 * object.
 */
export interface HandlerContext<T = any> {
  /**
   * The resolved route.
   */
  route: Route;
  /**
   * Param values from the route, e.g. a route like `/route/[slug].tsx` will
   * pass `{slug: 'foo'}`.
   */
  params: RouteParams;
  /**
   * i18n locales to try for the user's http request. The priority order mimics
   * the Firebase Hosting i18n fallback logic.
   * https://firebase.google.com/docs/hosting/i18n-rewrites#priority-order
   */
  i18nFallbackLocales: string[];
  /** Renders the default exported component from the route. */
  render: (props: T) => Promise<void>;
  /** Renders a 404 page. */
  render404: () => Promise<void>;
}

/**
 * The `handle()` function can be exported by a route to define a custom express
 * request handler. The `req` object will contain a `handlerContext` which
 * contains the route's param values and also a `render()` method that can be
 * used to render the route's default component.
 */
export type Handler = (
  req: Request,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

export interface RouteModule {
  default?: ComponentType<unknown>;
  getStaticPaths?: GetStaticPaths;
  getStaticProps?: GetStaticProps;
  handle?: Handler;
}

export interface Route {
  /** The relative path to the route file, e.g. `routes/index.tsx`. */
  src: string;

  /** The imported route module. */
  module: RouteModule;

  /** The locale used for the route. */
  locale: string;

  /**
   * Returns `true` if the route is the default locale route mapped without the
   * i18n url prefix. For example, a route may be mapped to `/foo` and
   * `/[locale]/foo`. The `/foo` route would have `route.isDefaultLocale` set to
   * `true` whereas for `/[locale]/foo` it would be `false`.
   */
  isDefaultLocale: boolean;

  /**
   * The mapped URL path for the route, e.g.:
   *
   *   routes/index.tsx => `/`.
   *   routes/events.tsx => `/events`.
   *   routes/blog/[slug].tsx => `/blog/[slug]`.
   *
   * Per the example above, this value may contain placeholder params.
   */
  routePath: string;

  /**
   * The localized URL path for the route, e.g. `/[locale]/blog/[slug]`.
   * Per the example above, this value contains placeholder params.
   */
  localeRoutePath: string;
}
