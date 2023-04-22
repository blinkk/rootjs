import {Request, Route} from '../types';

import {ErrorPage} from './ErrorPage';

interface DevNotFoundPageProps {
  req: Request;
  sitemap: Record<string, {route: Route; params: Record<string, string>}>;
}

interface RoutesListMap {
  [src: string]: Array<RouteURLPath>;
}

interface RouteURLPath {
  route: Route;
  urlPath: string;
}

export function DevNotFoundPage(props: DevNotFoundPageProps) {
  const req = props.req;
  const routesListMap: RoutesListMap = {};
  let srcMaxLength = 0;
  Object.keys(props.sitemap).forEach((urlPath) => {
    const route = props.sitemap[urlPath].route;
    routesListMap[route.src] ??= [];
    routesListMap[route.src].push({route, urlPath});
    if (route.src.length > srcMaxLength) {
      srcMaxLength = route.src.length;
    }
  });
  const routeSrcs = Object.keys(routesListMap).sort(sortRouteFiles);
  const lines: string[] = [];
  routeSrcs.forEach((routeSrc) => {
    const routeUrls = routesListMap[routeSrc].sort(sortRouteURLs);
    routeUrls.forEach((routeUrl, i) => {
      const urlPath = routeUrl.urlPath;
      if (i === 0) {
        lines.push(`${routeSrc.padEnd(srcMaxLength, ' ')}  =>  ${urlPath}`);
      } else {
        lines.push(`${''.padEnd(srcMaxLength, ' ')}  =>  ${urlPath}`);
      }
    });
  });
  const routesListString = lines.join('\n');
  // const routesListString = routesList
  //   .map((route) => {
  //     return `${route.urlPath.padEnd(srcMaxLength, ' ')}  =>  ${route.src}`;
  //   })
  //   .join('\n');
  return (
    <ErrorPage code={404} title="Not found">
      <h2>Routes</h2>
      {Object.keys(routesListMap).length > 0 ? (
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

function sortRouteFiles(a: string, b: string): number {
  if (a === 'routes/index.tsx') {
    return -1;
  }
  if (b === 'routes/index.tsx') {
    return 1;
  }
  return a.localeCompare(b);
}

function sortRouteURLs(a: RouteURLPath, b: RouteURLPath): number {
  if (a.route.isDefaultLocale && !b.route.isDefaultLocale) {
    return -1;
  }
  if (!a.route.isDefaultLocale && b.route.isDefaultLocale) {
    return 1;
  }
  return a.urlPath.localeCompare(b.urlPath);
}
