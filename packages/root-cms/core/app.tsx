import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {Request, Response} from '@blinkk/root';
import {render as renderToString} from 'preact-render-to-string';

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
        <title>{props.title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@500&display=swap"
        />
        <link rel="stylesheet" href="{CSS_URL}" />
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
        />
        <script type="module" src="{JS_URL}"></script>
      </body>
    </html>
  );
}

export async function renderApp(req: Request, res: Response, options: any) {
  const collectionModules = import.meta.glob('/collections/*.schema.ts', {
    eager: true,
  }) as any;
  const collections: Record<string, Collection> = {};
  Object.keys(collectionModules).forEach((moduleId: string) => {
    const collectionId = path.parse(moduleId).base.split('.')[0];
    const module = collectionModules[moduleId];
    const collection = module.default as Collection;
    collections[collectionId] = collection;
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
    },
    firebaseConfig: options.firebaseConfig,
    gapi: cmsConfig.gapi,
    collections: collections,
  };
  const projectName = cmsConfig.name || cmsConfig.id || '';
  const title = projectName ? `${projectName} – Root.js CMS` : 'Root.js CMS';

  const mainHtml = renderToString(<App title={title} ctx={ctx} />);
  let html = `<!doctype html>\n${mainHtml}`;
  if (req.viteServer) {
    const uiCssPath = path.join(__dirname, 'ui/ui.css');
    const uiJsPath = path.join(__dirname, 'ui/ui.js');
    const tpl = html
      .replace('{CSS_URL}', `/@fs${uiCssPath}`)
      .replace('{JS_URL}', `/@fs${uiJsPath}`);
    html = await req.viteServer!.transformIndexHtml(req.originalUrl, tpl);
  } else {
    html = html
      .replace('{CSS_URL}', '/cms/static/ui.css')
      .replace('{JS_URL}', '/cms/static/ui.js');
  }
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
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
        />
        <link rel="stylesheet" href="{CSS_URL}" />
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
        />
        <script type="module" src="{JS_URL}"></script>
      </body>
    </html>
  );
}
export async function renderSignIn(req: Request, res: Response, options: any) {
  const ctx = {name: options.name, firebaseConfig: options.firebaseConfig};
  const mainHtml = renderToString(<SignIn title="Sign in" ctx={ctx} />);
  let html = `<!doctype html>\n${mainHtml}`;
  if (req.viteServer) {
    const cssPath = path.join(__dirname, 'ui/signin.css');
    const jsPath = path.join(__dirname, 'ui/signin.js');
    const tpl = html
      .replace('{CSS_URL}', `/@fs${cssPath}`)
      .replace('{JS_URL}', `/@fs${jsPath}`);
    html = await req.viteServer!.transformIndexHtml(req.originalUrl, tpl);
  } else {
    html = html
      .replace('{CSS_URL}', '/cms/static/signin.css')
      .replace('{JS_URL}', '/cms/static/signin.js');
  }
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}
