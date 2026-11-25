import path from 'node:path';

import {RootConfig} from '../core/config.js';
import {Route} from '../core/types.js';
import {transformHtml} from '../render/html-transform.js';
import {writeFile} from '../utils/fsutils.js';

type Renderer = import('../render/render.js').Renderer;

/** A single page to build during the SSG phase of `root build`. */
export interface BuildPageTask {
  /** The url path to build, e.g. `/intl/de/about/`. */
  urlPath: string;
  /** Route params used to build the page. */
  params: Record<string, string>;
  /**
   * The route's src file (e.g. `routes/blog/[slug].tsx`). Used by worker
   * threads to disambiguate overlapping routes that match the same url path.
   */
  routeSrc?: string;
  /** The route's locale, used with `routeSrc` to disambiguate routes. */
  locale?: string;
}

/** The result of building a single page. */
export interface BuildPageResult {
  urlPath: string;
  /** Output file path relative to the build dir. Unset when `notFound`. */
  outFilePath?: string;
  /** Output file size in bytes. Unset when `notFound`. */
  sizeBytes?: number;
  notFound?: boolean;
  /** Whether the output was generated via `getStaticContent()`. */
  staticContent?: boolean;
}

/** Message sent from the build worker to the main thread. */
export type BuildWorkerResponse =
  | {type: 'ready'}
  | {type: 'result'; id: number; result: BuildPageResult}
  | {
      type: 'error';
      id: number;
      urlPath: string;
      params: Record<string, string>;
      routeSrc?: string;
      error: string;
    }
  | {type: 'fatal'; error: string};

/** Message sent from the main thread to the build worker. */
export type BuildWorkerRequest = {
  type: 'render';
  id: number;
  task: BuildPageTask;
};

/**
 * Builds a single page (or static content file) to the build dir. Shared by
 * the in-process SSG build loop and the `--threads` build worker.
 */
export async function buildPage(
  renderer: Renderer,
  rootConfig: RootConfig,
  buildDir: string,
  route: Route,
  task: BuildPageTask
): Promise<BuildPageResult> {
  const {urlPath, params} = task;
  const routeModule = route.module;
  if (routeModule.getStaticContent) {
    let props: any;
    if (routeModule.getStaticProps) {
      props = await routeModule.getStaticProps({
        rootConfig,
        params,
      });
      if (props?.notFound) {
        return {urlPath, notFound: true};
      }
    } else {
      props = {rootConfig, params};
    }
    const result = await routeModule.getStaticContent(props);
    let body: string | Buffer;
    if (typeof result === 'string' || Buffer.isBuffer(result)) {
      body = result;
    } else if (result && typeof result === 'object') {
      body = result.body ?? '';
    } else {
      body = '';
    }
    const outFilePath = urlPath.slice(1);
    const outPath = path.join(buildDir, outFilePath);
    const output = Buffer.isBuffer(body) ? body : normalizeLineEndings(body);
    await writeFile(outPath, output);
    return {
      urlPath,
      outFilePath,
      sizeBytes: Buffer.isBuffer(output)
        ? output.byteLength
        : Buffer.byteLength(output, 'utf8'),
      staticContent: true,
    };
  }

  const data = await renderer.renderRoute(route, {
    routeParams: params,
  });
  if (data.notFound) {
    return {urlPath, notFound: true};
  }

  let outFilePath = path.join(urlPath.slice(1), 'index.html');
  if (outFilePath.endsWith('404/index.html')) {
    outFilePath = outFilePath.replace('404/index.html', '404.html');
  }
  const outPath = path.join(buildDir, outFilePath);

  const html = await transformHtml(data.html || '', rootConfig);
  const output = normalizeLineEndings(html);
  await writeFile(outPath, output);
  return {
    urlPath,
    outFilePath,
    sizeBytes: Buffer.byteLength(output, 'utf8'),
  };
}

export function normalizeLineEndings(str: string): string {
  return str.replace(/\r\n?/g, '\n');
}
