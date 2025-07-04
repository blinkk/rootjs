import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Request, Response, RootConfig} from '@blinkk/root';
import {render as renderToString} from 'preact-render-to-string';
import packageJson from '../package.json' assert {type: 'json'};
import {CMSPluginOptions} from './plugin.js';
import {getProjectSchemas} from './project.js';
import {Collection} from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface AppProps {
  title: string;
  ctx: any;
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
          href="https://lh3.googleusercontent.com/ijK50TfQlV_yJw3i-CMlnD6osH4PboZBILZrJcWhoNMEmoyCD5e1bAxXbaOPe5w4gG_Scf37EXrmZ6p8sP2lue5fLZ419m5JyLMs=e385-w256"
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
  Object.entries(getCollections()).forEach(([collectionId, collection]) => {
    collections[collectionId] = serializeCollection(collection);
  });
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
  };
  const projectName = cmsConfig.name || cmsConfig.id || '';
  const title = projectName ? `${projectName} – Root CMS` : 'Root CMS';

  const mainHtml = renderToString(<App title={title} ctx={ctx} />);
  let html = `<!doctype html>\n${mainHtml}`;
  const nonce = generateNonce();
  if (req.viteServer) {
    const uiCssPath = path.join(__dirname, 'ui/ui.css');
    const uiJsPath = path.join(__dirname, 'ui/ui.js');
    const tpl = html
      .replace('{CSS_URL}', cachebust(req, `/@fs${uiCssPath}`))
      .replace('{JS_URL}', cachebust(req, `/@fs${uiJsPath}`))
      .replaceAll('{NONCE}', nonce);
    html = await req.viteServer!.transformIndexHtml(req.originalUrl, tpl);
    html = html.replace(
      '<script type="module" src="/@vite/client"></script>',
      `<script type="module" src="/@vite/client" nonce="${nonce}"></script>`
    );
  } else {
    html = html
      .replace('{CSS_URL}', cachebust(req, '/cms/static/ui.css'))
      .replace('{JS_URL}', cachebust(req, '/cms/static/ui.js'))
      .replaceAll('{NONCE}', nonce);
  }
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
    domain: collection.domain,
    url: collection.url,
    previewUrl: collection.previewUrl,
    preview: collection.preview,
    slugRegex: collection.slugRegex,
    autolock: collection.autolock,
    autolockReason: collection.autolockReason,
  };
}

interface SignInProps {
  title: string;
  ctx: any;
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
          href="https://lh3.googleusercontent.com/ijK50TfQlV_yJw3i-CMlnD6osH4PboZBILZrJcWhoNMEmoyCD5e1bAxXbaOPe5w4gG_Scf37EXrmZ6p8sP2lue5fLZ419m5JyLMs=e385-w256"
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
  const mainHtml = renderToString(<SignIn title="Sign in" ctx={ctx} />);
  let html = `<!doctype html>\n${mainHtml}`;
  const nonce = generateNonce();
  if (req.viteServer) {
    const cssPath = path.join(__dirname, 'ui/signin.css');
    const jsPath = path.join(__dirname, 'ui/signin.js');
    const tpl = html
      .replace('{CSS_URL}', cachebust(req, `/@fs${cssPath}`))
      .replace('{JS_URL}', cachebust(req, `/@fs${jsPath}`))
      .replaceAll('{NONCE}', nonce);
    html = await req.viteServer!.transformIndexHtml(req.originalUrl, tpl);
    html = html.replace(
      '<script type="module" src="/@vite/client"></script>',
      `<script type="module" src="/@vite/client" nonce="${nonce}"></script>`
    );
  } else {
    html = html
      .replace('{CSS_URL}', cachebust(req, '/cms/static/signin.css'))
      .replace('{JS_URL}', cachebust(req, '/cms/static/signin.js'))
      .replaceAll('{NONCE}', nonce);
  }
  res.setHeader('Content-Type', 'text/html');
  setSecurityHeaders(options, req, res, nonce);
  res.status(403);
  res.send(html);
}

export function getCollections(): Record<string, Collection> {
  const collections: Record<string, Collection> = {};
  const schemas = getProjectSchemas();
  Object.entries(schemas).forEach(([fileId, schema]) => {
    if (fileId.startsWith('/collections/')) {
      const collectionId = parseCollectionId(fileId);
      collections[collectionId] = {...schema, id: collectionId} as Collection;
    }
  });
  return collections;
}

/**
 * Converts a fileId path like "/collections/Foo.schema.ts" and returns "Foo".
 */
function parseCollectionId(fileId: string) {
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
  // In local dev, use the the timestamp to cachebust.
  // In non-local mode, use the package version.
  const value =
    req.hostname === 'localhost'
      ? Math.floor(new Date().getTime() / 1000)
      : packageJson.version;
  return `${url}?c=${value}`;
}
