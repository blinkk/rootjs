import path from 'node:path';
import {default as express, Request, Response, NextFunction} from 'express';
import {loadRootConfig} from '../load-config';
import {Renderer} from '../../render/render.js';
import {fileExists, loadJson} from '../../core/fsutils';
import {
  BuildAssetManifest,
  BuildAssetMap,
} from '../../render/asset-map/build-asset-map';
import {htmlMinify} from '../../render/html-minify';

export async function start(rootProjectDir?: string) {
  process.env.NODE_ENV = 'production';
  const rootDir = rootProjectDir || process.cwd();
  process.chdir(rootDir);
  const rootConfig = await loadRootConfig(rootDir);
  const distDir = path.join(rootDir, 'dist');

  const render = await import(path.join(distDir, 'server/render.js'));
  const renderer = new render.Renderer(rootConfig) as Renderer;

  const manifestPath = path.join(distDir, 'client/root-manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(
      `could not find ${manifestPath}. run \`root build\` before \`root start\`.`
    );
  }
  const rootManifest = await loadJson<BuildAssetManifest>(manifestPath);
  const assetMap = BuildAssetMap.fromRootManifest(rootManifest);

  const app = express();

  const publicDir = path.join(distDir, 'html');
  app.use(express.static(publicDir));
  // TODO(stevenle): add middleware that checks for pre-built HTML in dist/.

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const url = req.originalUrl;
      const data = await renderer.render(url, {
        assetMap: assetMap,
      });
      let html = data.html || '';
      if (rootConfig.minifyHtml !== false) {
        html = await htmlMinify(html);
      }
      res.status(200).set({'Content-Type': 'text/html'}).end(html);
    } catch (e) {
      try {
        const {html} = await renderer.renderError(e);
        res.status(500).set({'Content-Type': 'text/html'}).end(html);
      } catch (e2) {
        console.error('failed to render custom error');
        console.error(e2);
        next(e);
      }
    }
  });

  const port = parseInt(process.env.PORT || '4007');
  console.log(`\nStarted prod server: http://localhost:${port}`);
  app.listen(port);
}
