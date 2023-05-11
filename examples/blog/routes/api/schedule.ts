/** Manually triggers scheduled publishing. */

import {Handler} from '@blinkk/root';
import {publishScheduledDocs} from '@blinkk/root-cms';

export const handle: Handler = async (req, res) => {
  try {
    const docs = await publishScheduledDocs(req.rootConfig);
    if (import.meta.env.DEV) {
      res.json({success: true, docs: docs});
    } else {
      res.json({success: true});
    }
  } catch (err) {
    console.error(err.stack || err);
    if (import.meta.env.DEV) {
      res.status(500).json({success: false, error: String(err.stack || err)});
    } else {
      res.status(500).json({success: false, error: 'UNKNOWN_SERVER_ERROR'});
    }
  }
}
