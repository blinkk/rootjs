import {Server} from '@blinkk/root';
import {arrayToCsv} from './csv.js';

/**
 * Registers API middleware handlers.
 */
export function api(server: Server) {
  server.use('/cms/api/csv.download', (req, res) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
    }

    const body = req.body || {};
    const headers = body.headers || [];
    const rows = body.rows || [];
    const csv = arrayToCsv({headers, rows});
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="data.csv"');
    res.status(200).end(csv);
  });
}
