import {
  Express,
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction as ExpressNextFunction,
} from 'express';
import {ViteDevServer} from 'vite';
import {Renderer} from '../render/render';
import {RootConfig} from './config';

export type GetStaticProps<T = unknown> = (ctx: {
  params: Record<string, string>;
}) => Promise<{
  props?: T;
  // Set to true if the route should result in a 404 page.
  notFound?: boolean;
}>;

export type GetStaticPaths<T = Record<string, string>> = () => Promise<{
  paths: Array<{params: T}>;
}>;

export type Server = Express;

export type Request = ExpressRequest & {
  /** The root.js project config. */
  rootConfig?: RootConfig & {rootDir: string};
  /** The vite dev server. This is only available when running `root dev`. */
  viteServer?: ViteDevServer;
  /** The root.js renderer, to render routes within middlware. */
  renderer?: Renderer;
};

export type Response = ExpressResponse;

export type NextFunction = ExpressNextFunction;
