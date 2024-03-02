import {Handler} from '@blinkk/root';

export const handle: Handler = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.get('x-access-token') !== 'foobar') {
    res.status(401).json({success: false, error: 'unauthorized'});
    return;
  }
  res.json({success: true, data: 'hello from "foo" route'});
}
