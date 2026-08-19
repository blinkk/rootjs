/**
 * Maximum size of a CSV accepted by `/cms/api/csv.import`, in bytes. Shared by
 * the server (the body parser and multipart limits) and the UI (which checks
 * the file size before uploading) so the two can't drift apart.
 *
 * Requests are sent as a raw `text/plain` body, so the request body size
 * matches the file size on disk. Note that Cloud Functions applies its own
 * 10mb request limit upstream, so raising this alone would not raise the
 * effective ceiling in production.
 */
export const MAX_CSV_IMPORT_BYTES = 10 * 1024 * 1024;

/** Human-readable form of {@link MAX_CSV_IMPORT_BYTES}, for error messages. */
export const MAX_CSV_IMPORT_LABEL = '10 MB';
