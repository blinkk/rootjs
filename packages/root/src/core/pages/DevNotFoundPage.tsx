import {Request, Route} from '../types';
import {ErrorPage} from './ErrorPage';

interface DevNotFoundPageProps {
  req: Request;
  sitemap: Record<string, {route: Route; params: Record<string, string>}>;
}

export function DevNotFoundPage(props: DevNotFoundPageProps) {
  const req = props.req;
  const routesList: Array<{src: string; urlPath: string}> = [];
  let maxUrlLen = 0;
  Object.keys(props.sitemap).forEach((urlPath) => {
    const route = props.sitemap[urlPath].route;
    routesList.push(Object.assign({}, route, {urlPath}));
    if (urlPath.length > maxUrlLen) {
      maxUrlLen = urlPath.length;
    }
  });
  const routesListString = routesList
    .map((route) => {
      return `${route.urlPath.padEnd(maxUrlLen, ' ')}  =>  ${route.src}`;
    })
    .join('\n');
  return (
    <ErrorPage code={404} title="Root.js">
      <h2>Routes</h2>
      {routesList.length > 0 ? (
        <pre className="box">
          <code>{routesListString}</code>
        </pre>
      ) : (
        <div className="box">
          Add your first route at <code>/routes/index.tsx</code>
        </div>
      )}

      <h2>Debug Info</h2>
      <pre className="box">
        <code>{`url: ${req.originalUrl}`}</code>
      </pre>
    </ErrorPage>
  );
}
