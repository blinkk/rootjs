import path from 'path';
import {fileURLToPath} from 'url';
import express from 'express';
import {createServer as createViteServer} from 'vite';
import {minify} from 'html-minifier-terser';
import pluginRoot from '../../dist/server/vite-plugin-root.js';
import {DevServerAssetMap} from '../../dist/server/asset-map/dev-asset-map.js';
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');
const version = packageJson.version;

import load from '@proload/core';
import typescript from '@proload/plugin-typescript';
load.use([typescript]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createServer() {
  const app = express();

  app.use(express.static('public'));
  const middlewares = await getMiddlewares();
  middlewares.forEach(middleware => app.use(middleware));

  const port = parseInt(process.env.PORT || '4007');
  console.log(`🌳 Root.js v${version}`);
  console.log();
  console.log(`Started server: http://localhost:${port}`);
  app.listen(port);
}

export async function getMiddlewares() {
  const rootDir = process.cwd();
  const loadedConfig = await load('root', {cwd: rootDir});
  const rootConfig = loadedConfig.value;

  // Create Vite server in middleware mode and configure the app type as
  // 'custom', disabling Vite's own HTML serving logic so parent server
  // can take control
  const viteServer = await createViteServer({
    server: {middlewareMode: true},
    appType: 'custom',
    resolve: {
      alias: {
        '@': path.resolve(rootDir, './src'),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          includePaths: [
            path.resolve(rootDir, './src/styles')
          ],
        },
      },
    },
    plugins: [pluginRoot()],
  });

  const rootMiddleware = async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const {render} = await viteServer.ssrLoadModule(
        path.join(__dirname, '../../dist/server/render.jsx')
      );

      const assetMap = new DevServerAssetMap(viteServer.moduleGraph);
      const data = await render(url, {
        config: rootConfig,
        assetMap: assetMap,
      });
      const html = await minifyHtml(
        await viteServer.transformIndexHtml(url, data.html || '')
      );

      res.status(200).set({'Content-Type': 'text/html'}).end(html);
    } catch (e) {
      // If an error is caught, let Vite fix the stack trace so it maps back to
      // your actual source code.
      viteServer.ssrFixStacktrace(e);
      try {
        const {renderError} = await viteServer.ssrLoadModule(
          path.join(__dirname, '../../dist/server/render.jsx')
        );
        const {html} = await renderError(e);
        res.status(500).set({'Content-Type': 'text/html'}).end(html);
      } catch(e2) {
        console.error('failed to render custom error');
        console.error(e2);
        next(e);
      }
    }
  };

  return [viteServer.middlewares, rootMiddleware];
}

async function minifyHtml(html) {
  const min = await minify(html, {
    collapseWhitespace: true,
    removeComments: true,
    preserveLineBreaks: true,
  });
  return min.trimStart();
}

export default function dev() {
  createServer();
}
