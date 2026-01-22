import {Handler} from '@blinkk/root';

export const handle: Handler = (req, res, next) => {
  res.setHeader('X-Custom-Header', 'plugin-route');
  next();
};

export default function HandlerRoute() {
  return <h1>Handler Route</h1>;
}
