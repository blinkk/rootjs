import {stringify as csvStringify} from 'csv-stringify/sync';

export function arrayToCsv(req: {
  headers: string[];
  rows: Array<Record<string, any>>;
}): string {
  const headers = req.headers || [];
  const rows = req.rows || [];
  return csvStringify(rows, {
    header: true,
    columns: headers,
  });
}
