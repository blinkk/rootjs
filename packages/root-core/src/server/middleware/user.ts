import firebase from 'firebase-admin';
import {Project} from '../../workspace/Project';
import * as server from '../types';

/**
 * Middleware that decorates the request object with a user, if logged in.
 */
export function user(project: Project) {
  return async (
    req: server.Request,
    res: server.Response,
    next: server.NextFunction
  ) => {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
      const idToken = req.headers.authorization.split('Bearer ')[1];
      try {
        const app = project.app();
        const currentUser = await firebase.auth(app).verifyIdToken(idToken);
        req.currentUser = currentUser;
      } catch (err) {
        console.error(err);
        res.writeHead(500, {'Content-Type': 'text/plain'});
        res.end('Internal server error');
        return;
      }
    }
    next();
  };
}
