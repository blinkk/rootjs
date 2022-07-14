const {createServer} = require('http');
const {parse} = require('url');
const next = require('next');
const root = require('@blinkk/root-core');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;
const app = next({dev, hostname, port});
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const project = await root.Project.init(process.cwd());
  const rootServer = root.createServer(project);
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      const pathname = parsedUrl.pathname;
      const query = parsedUrl.query;

      if (pathname.startsWith('/cms')) {
        // TODO(stevenle): render CMS.
        console.log(pathname);
        console.log(query);
        rootServer(req, res);
      } else {
        await handle(req, res, parsedUrl);
      }
    } catch (err) {
      console.error('req failed', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });
  server.listen(port, (err) => {
    if (err) {
      throw err;
    }
    console.log(`listening at http://${hostname}:${port}/cms`)
  })
});
