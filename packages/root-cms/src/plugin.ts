import {Plugin, Request, Response} from '@blinkk/root';

type CMSPluginOptions = {};

export function cmsPlugin(options?: CMSPluginOptions): Plugin {
  return {
    name: 'root-cms',
    configureServer: (server) => {
      server.use('/cms', (req: Request, res: Response) => {
        console.log('root config context var:');
        console.log(req.rootConfig);
        res.end('cms');
      });
    },
  };
}
