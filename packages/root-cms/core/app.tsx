import crypto from 'node:crypto';
import path from 'node:path';
import {Request, Response, RootConfig} from '@blinkk/root';
import {render as renderToString} from 'preact-render-to-string';
import {CMSPluginOptions} from './plugin.js';
import {getCollectionSchema, getProjectSchemas} from './project.js';
import {Collection} from './schema.js';
import {getServerVersion} from './server-version.js';

const DEFAULT_FAVICON_URL =
  'https://lh3.googleusercontent.com/ijK50TfQlV_yJw3i-CMlnD6osH4PboZBILZrJcWhoNMEmoyCD5e1bAxXbaOPe5w4gG_Scf37EXrmZ6p8sP2lue5fLZ419m5JyLMs=e385-w256';

interface AppProps {
  title: string;
  ctx: any;
  favicon?: string;
}

function App(props: AppProps) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <title>{props.title}</title>
        <meta name="robots" content="noindex" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&display=swap"
          nonce="{NONCE}"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@500&display=swap"
          nonce="{NONCE}"
        />
        <link
          rel="icon"
          href={props.favicon || DEFAULT_FAVICON_URL}
          type="image/png"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.6.0/styles/atom-one-light.min.css"
          nonce="{NONCE}"
        />
        <link rel="stylesheet" href="{CSS_URL}" nonce="{NONCE}" />
      </head>
      <body>
        <div id="root">
          <div className="bootstrap">
            <h1 className="bootstrap__loading">Loading...</h1>
            <div className="bootstrap-error">
              If this page fails to load, try a force refresh by holding the
              shift key while refreshing the page.
            </div>
          </div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ROOT_CTX = ${JSON.stringify(props.ctx)}`,
          }}
          nonce="{NONCE}"
        />
        <script type="module" src="{JS_URL}" nonce="{NONCE}"></script>
      </body>
    </html>
  );
}

interface RenderOptions {
  rootConfig: RootConfig;
  cmsConfig: CMSPluginOptions;
}

export async function renderApp(
  req: Request,
  res: Response,
  options: RenderOptions
) {
  // Exclude "fields" from the serialized collections to reduce payload size.
  const collections: Record<string, Partial<Collection>> = {};
  Object.entries(await getCollections()).forEach(
    ([collectionId, collection]) => {
      collections[collectionId] = serializeCollection(collection);
    }
  );
  const rootConfig = options.rootConfig || {};
  const cmsConfig = options.cmsConfig || {};
  let gci = cmsConfig.gci;
  if (gci === true) {
    gci = 'https://gci.rootjs.dev';
  }
  const ctx = {
    rootConfig: {
      projectId: cmsConfig.id || 'default',
      projectName: cmsConfig.name || cmsConfig.id || '',
      minimalBranding: cmsConfig.minimalBranding ?? false,
      domain: rootConfig.domain || 'https://example.com',
      base: rootConfig.base || '/',
      gci: gci,
      i18n: rootConfig.i18n,
      server: {
        trailingSlash: rootConfig.server?.trailingSlash,
      },
    },
    firebaseConfig: cmsConfig.firebaseConfig,
    gapi: cmsConfig.gapi,
    collections: collections,
    sidebar: cmsConfig.sidebar,
    experiments: cmsConfig.experiments,
    preview: {
      channel: cmsConfig.preview?.channel ?? false,
    },
  };
  const projectName = cmsConfig.name || cmsConfig.id || '';
  const title = projectName ? `${projectName} – Root CMS` : 'Root CMS';

  const mainHtml = renderToString(
    <App title={title} ctx={ctx} favicon={cmsConfig.favicon} />
  );
  const nonce = generateNonce();
  const html = `<!doctype html>\n${mainHtml}`
    .replace('{CSS_URL}', cachebust(req, '/cms/static/ui.css'))
    .replace('{JS_URL}', cachebust(req, '/cms/static/ui.js'))
    .replaceAll('{NONCE}', nonce);
  res.setHeader('Content-Type', 'text/html');
  setSecurityHeaders(options, req, res, nonce);
  res.send(html);
}

/**
 * Returns a collection object that can be serialized to JSON.
 * NOTE: The collection's schema "fields" are excluded to avoid large JSON
 * outputs.
 */
function serializeCollection(collection: Collection): Partial<Collection> {
  return {
    id: collection.id,
    name: collection.name ?? collection.id,
    description: collection.description,
    group: collection.group,
    domain: collection.domain,
    url: collection.url,
    previewUrl: collection.previewUrl,
    preview: collection.preview,
    slugRegex: collection.slugRegex,
    autolock: collection.autolock,
    autolockReason: collection.autolockReason,
    sortOptions: collection.sortOptions,
  };
}

interface SignInProps {
  title: string;
  ctx: any;
  favicon?: string;
}

function SignIn(props: SignInProps) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <title>{props.title}</title>
        <meta name="robots" content="noindex" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css?family=Google+Sans:400,500&display=swap"
          nonce="{NONCE}"
        />
        <link
          rel="icon"
          href={props.favicon || DEFAULT_FAVICON_URL}
          type="image/png"
        />
        <link rel="stylesheet" href="{CSS_URL}" nonce="{NONCE}" />
      </head>
      <body>
        <div id="root">
          <div className="bootstrap">
            <h1 className="bootstrap__loading">Loading...</h1>
            <div className="bootstrap-error">
              If this page fails to load, try a force refresh by holding the
              shift key while refreshing the page.
            </div>
          </div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ROOT_CTX = ${JSON.stringify(props.ctx)}`,
          }}
          nonce="{NONCE}"
        />
        <script type="module" src="{JS_URL}" nonce="{NONCE}"></script>
      </body>
    </html>
  );
}
export async function renderSignIn(
  req: Request,
  res: Response,
  options: RenderOptions
) {
  const ctx = {
    name: options.cmsConfig.name || options.cmsConfig.id || '',
    firebaseConfig: options.cmsConfig.firebaseConfig,
  };
  const mainHtml = renderToString(
    <SignIn title="Sign in" ctx={ctx} favicon={options.cmsConfig.favicon} />
  );
  const nonce = generateNonce();
  const html = `<!doctype html>\n${mainHtml}`
    .replace('{CSS_URL}', cachebust(req, '/cms/static/signin.css'))
    .replace('{JS_URL}', cachebust(req, '/cms/static/signin.js'))
    .replaceAll('{NONCE}', nonce);
  res.setHeader('Content-Type', 'text/html');
  setSecurityHeaders(options, req, res, nonce);
  res.status(403);
  res.send(html);
}

export async function getCollections(): Promise<Record<string, Collection>> {
  const collections: Record<string, Collection> = {};
  const schemas = await getProjectSchemas();
  Object.entries(schemas).forEach(([fileId, schema]) => {
    if (fileId.startsWith('/collections/')) {
      const collectionId = toCollectionId(fileId);
      collections[collectionId] = {id: collectionId, ...schema} as Collection;
    }
  });
  return collections;
}

/**
 * Returns a collection's schema definition as defined in
 * `/collections/<id>.schema.ts`.
 */
export async function getCollection(
  collectionId: string
): Promise<Collection | null> {
  return getCollectionSchema(collectionId);
}

/**
 * Converts a fileId path like "/collections/Foo.schema.ts" and returns "Foo".
 */
function toCollectionId(fileId: string) {
  return path.basename(fileId).split('.')[0];
}

function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

function setSecurityHeaders(
  options: RenderOptions,
  req: Request,
  res: Response,
  nonce: string
) {
  res.setHeader(
    'strict-transport-security',
    'max-age=63072000; includeSubdomains; preload'
  );
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-xss-protection', '1; mode=block');

  const frameAncestors = ["'self'"];
  const allowedIframeOrigins = options.cmsConfig.allowedIframeOrigins;
  if (allowedIframeOrigins && allowedIframeOrigins.length > 0) {
    const refererOrigin = getRefererOrigin(req);
    if (allowedIframeOrigins.includes(refererOrigin)) {
      frameAncestors.push(refererOrigin);
    }
  }

  // https://csp.withgoogle.com/docs/strict-csp.html
  const directives = [
    "base-uri 'none'",
    "object-src 'none'",
    `script-src 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' 'strict-dynamic' https: http:`,
    `frame-ancestors ${frameAncestors.join(' ')}`,
  ];
  res.setHeader('content-security-policy-report-only', directives.join('; '));
}

function getRefererOrigin(req: Request): string {
  const refererUrl = req.headers.referer;
  if (!refererUrl) {
    return '';
  }
  const parsedReferer = new URL(refererUrl);
  const refererOrigin = `${parsedReferer.protocol}//${parsedReferer.hostname}`;
  return refererOrigin;
}

/** Modify the given URL to bust the cache. */
function cachebust(req: Request, url: string) {
  const cb = getServerVersion();
  const host = req.get('host');
  // On localhost, use a full URL so that the vite server doesn't attempt to
  // transform the file.
  if (host?.includes('localhost')) {
    return `http://${host}${url}?c=${cb}`;
  }
  return `${url}?c=${cb}`;
}
