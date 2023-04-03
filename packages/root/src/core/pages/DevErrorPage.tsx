import {Request, Route, RouteParams} from '../types';
import {ErrorPage} from './ErrorPage';

interface DevErrorPageProps {
  req: Request;
  route?: Route;
  routeParams?: RouteParams;
  error: any;
}

export function DevErrorPage(props: DevErrorPageProps) {
  const req = props.req;
  const err = props.error;
  const route = props.route;
  const routeParams = props.routeParams;

  let errMsg = String(err);
  if (err && err.stack) {
    // Obfuscate some user info from the stack trace so that when people send
    // error reports and screenshots, less identifiable information is sent.
    errMsg = err.stack
      .replace(/\(.*node_modules/g, '(node_modules')
      .replace(/at \/.*node_modules/g, 'at node_modules');
    if (req.rootConfig?.rootDir) {
      errMsg = errMsg.replaceAll(req.rootConfig.rootDir, '<root>');
    }
    if (process.env.HOME) {
      errMsg = errMsg.replaceAll(process.env.HOME, '$HOME');
    }
  }
  return (
    <ErrorPage code={500} title="Something went wrong">
      {errMsg && (
        <>
          <h2>Error</h2>
          <pre className="box">
            <code>{errMsg}</code>
          </pre>
        </>
      )}
      <h2>Debug Info</h2>
      <pre className="box">
        <code>{`url: ${req.originalUrl}
route: ${route?.src || 'null'}
routeParams: ${(routeParams && JSON.stringify(routeParams)) || 'null'}`}</code>
      </pre>
    </ErrorPage>
  );
}
