import {Response} from '@blinkk/root';
import {Collection} from './schema.js';
import {UserRequest} from './users.js';
import {render as renderToString} from 'preact-render-to-string';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface AppProps {
  title: string;
  ctx: any;
}

function App(props: AppProps) {
  const uiCssPath = path.join(__dirname, 'ui.css');
  const uiJsPath = path.join(__dirname, 'ui.js');
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
        <link rel="stylesheet" href={`/@fs${uiCssPath}`} />
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
        <script type="module" src={`/@fs${uiJsPath}`}></script>
      </body>
    </html>
  );
}

export async function renderApp(req: UserRequest, res: Response, options: any) {
  const collectionModules = import.meta.glob('/collections/*.schema.ts', {
    eager: true,
  }) as any;
  const collections = Object.values(collectionModules).map(
    (module: any) => module.default as Collection
  );
  const rootConfig = options.rootConfig || {};
  const ctx = {
    rootConfig: {
      projectId: rootConfig.projectId || 'default',
      domain: rootConfig.domain || 'https://example.com',
    },
    firebaseConfig: options.firebaseConfig,
    collections: collections,
  };
  const mainHtml = renderToString(<App title="Root.js CMS" ctx={ctx} />);
  const html = await req.viteServer!.transformIndexHtml(
    req.originalUrl,
    `<!doctype html>\n${mainHtml}`
  );
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

interface SignInProps {
  title: string;
  ctx: any;
}

function SignIn(props: SignInProps) {
  const uiCssPath = path.join(__dirname, 'signin.css');
  const uiJsPath = path.join(__dirname, 'signin.js');
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
        <link rel="stylesheet" href={`/@fs${uiCssPath}`} />
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
        <script type="module" src={`/@fs${uiJsPath}`}></script>
      </body>
    </html>
  );
}
export async function renderSignIn(
  req: UserRequest,
  res: Response,
  options: any
) {
  const ctx = {firebaseConfig: options.firebaseConfig};
  const mainHtml = renderToString(<SignIn title="Sign in" ctx={ctx} />);
  const html = await req.viteServer!.transformIndexHtml(
    req.originalUrl,
    `<!doctype html>\n${mainHtml}`
  );
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}
