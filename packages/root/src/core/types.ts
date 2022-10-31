import {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction as ExpressNextFunction,
} from 'express';

export type GetStaticProps<T = unknown> = (ctx: {
  params: Record<string, string>;
}) => Promise<{
  props: T;
  // Set to true if the route should result in a 404 page.
  notFound?: boolean;
}>;

export type GetStaticPaths<T = Record<string, string>> = () => Promise<{
  paths: Array<{params: T}>;
}>;

export type Request = ExpressRequest;

export type Response = ExpressResponse;

export type NextFunction = ExpressNextFunction;
