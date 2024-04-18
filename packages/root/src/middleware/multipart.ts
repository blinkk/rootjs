import busboy from 'busboy';
import {RequestHandler} from 'express';
import {Request, Response, NextFunction, MultipartFile} from '../core/types.js';

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Middleware for parsing multipart file uploads that's compatible with the dev
 * server and Firebase Functions.
 *
 * Context:
 * https://stackoverflow.com/questions/47242340/how-to-perform-an-http-file-upload-using-express-on-cloud-functions-for-firebase
 */
export function multipartMiddleware(options?: {
  maxFileSize?: number;
}): RequestHandler {
  const maxFileSize = options?.maxFileSize || DEFAULT_MAX_FILE_SIZE;
  const handler: any = (req: Request, res: Response, next: NextFunction) => {
    const contentType = String(req.headers['content-type'] || '');
    if (
      req.method === 'POST' &&
      contentType.startsWith('multipart/form-data')
    ) {
      const parser = busboy({headers: req.headers});

      // Data storage for fields and files
      const fields: {[fieldname: string]: string} = {};
      const files: {[name: string]: MultipartFile} = {};

      // Handle field data.
      parser.on('field', (fieldname: string, val: any) => {
        fields[fieldname] = val;
      });

      // Handle file data. Files are saved to an in-memory buffer.
      parser.on(
        'file',
        (
          fieldname: string,
          file: any,
          meta: {
            filename: string;
            encoding: string;
            mimeType: string;
          }
        ) => {
          const {filename, encoding, mimeType: mimetype} = meta;
          const fileChunks: Uint8Array[] = [];
          let totalBytesRead = 0;

          file.on('data', (chunk: Uint8Array) => {
            totalBytesRead += chunk.length;

            if (totalBytesRead > maxFileSize) {
              // File size exceeds the limit, stop reading.
              console.error(`File size exceeds the limit: ${fieldname}.`);
              file.removeAllListeners('data');
              // Consume and discard remaining data.
              file.resume();
            } else {
              fileChunks.push(chunk);
            }
          });

          file.on('end', () => {
            if (totalBytesRead <= maxFileSize) {
              const buffer = Buffer.concat(fileChunks);

              files[fieldname] = {
                fieldname,
                buffer,
                originalName: filename,
                encoding,
                mimetype,
              };
            }
          });
        }
      );

      // Update `req.body` and `req.files`.
      parser.on('finish', () => {
        req.body = fields;
        req.files = files;
        next();
      });

      // Pipe the request to Busboy. On Firebase Functions, `rawBody` contains
      // the multipart request. Otherwise the express request can be piped to
      // the Busboy parser.
      if (req.rawBody) {
        parser.end(req.rawBody);
      } else {
        req.pipe(parser);
      }
    } else {
      next();
    }
  };
  return handler;
}
