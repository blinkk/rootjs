import fs from 'fs';
import path from 'path';
import fastifyStatic from 'fastify-static';
import Application from '../Application';

const WEBUI_HTML = require.resolve('@blinkk/root-webui');
const WEBUI_ASSETS = path.join(path.dirname(WEBUI_HTML), 'assets');

/**
 * Server plugin that handles Web UI routes.
 */
export async function webui(app: Application) {
  app.register(fastifyStatic, {
    root: WEBUI_ASSETS,
    prefix: '/cms/assets',
  });
  const html = fs.readFileSync(WEBUI_HTML, 'utf-8');
  app.get('/cms', (_req, res) => {
    res.type('text/html');
    res.send(html);
  });
  app.get('/cms/*', (_req, res) => {
    res.type('text/html');
    res.send(html);
  });
}
