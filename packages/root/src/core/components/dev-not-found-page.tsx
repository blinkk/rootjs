import {Route} from '../../render/router';

const STYLES = `
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
}

h1 {
  margin-bottom: 40px;
}

.route-list {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: 24px;
  row-gap: 8px;
  padding: 0 40px;
}

.route-module {
  text-align: right;
}

hr {
  margin: 60px 0;
}
`;

interface DevNotFoundPageProps {
  routes: Record<string, Route>;
}

export function DevNotFoundPage(props: DevNotFoundPageProps) {
  const routesList: Array<Route & {urlPath: string}> = [];
  Object.keys(props.routes).forEach((urlPath) => {
    routesList.push(Object.assign({}, props.routes[urlPath], {urlPath}));
  });
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: STYLES}}></style>
      <div>
        <h1>
          <strong>404:</strong> Not Found
        </h1>
        {routesList.length > 0 ? (
          <>
            <h2>Routes found in the project:</h2>
            <div class="route-list">
              {routesList.map((route) => (
                <>
                  <div class="route-module">{route.modulePath}</div>
                  <a class="route-url" href={route.urlPath}>
                    {route.urlPath}
                  </a>
                </>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2>No routes found in the project</h2>
            <p>
              Add your first route at <code>/routes/index.tsx</code>
            </p>
          </>
        )}
        <hr />
        <p>
          Note: This page could use some love! If you're interested in helping
          to style this page, please reach out to the root.js developers!
        </p>
      </div>
    </>
  );
}
