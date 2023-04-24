import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);

// NOTE(stevenle): the csv-writer package has misconfigured "types" so `require`
// is needed here.
const createObjectCsvStringifier =
  require('csv-writer').createObjectCsvStringifier;
// import type {createObjectCsvStringifier} from 'csv-writer';

export function arrayToCsv(req: {
  headers: string[];
  rows: Array<Record<string, any>>;
}): string {
  const headers = req.headers || [];
  const rows = req.rows || [];
  if (headers.length === 0 || rows.length === 0) {
    return '';
  }

  const csvWriter = createObjectCsvStringifier({
    header: headers.map((h) => ({id: h, title: h})),
  });
  const csvHeader = csvWriter.getHeaderString() || '';
  const csvRows = csvWriter.stringifyRecords(rows) || '';
  return csvHeader + csvRows;
}
