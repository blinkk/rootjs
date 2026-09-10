/**
 * Browser-safe helpers for turning errors thrown by the Vercel AI SDK (and the
 * model providers behind it) into messages the CMS UI can show.
 *
 * `streamText` masks stream errors as "An error occurred." by default so that
 * server-side details are not leaked to the client. The CMS streams directly
 * from the browser, so there is nothing to hide: surfacing the provider's
 * actual message (e.g. Gemini's "This model is currently experiencing high
 * demand") lets the user know whether retrying is worthwhile.
 *
 * Keep this module free of Node-only imports.
 */
import {APICallError, RetryError} from 'ai';

/**
 * HTTP status codes that indicate a transient, load-related condition on the
 * provider's side (rate limits, overload, gateway timeouts). 529 is Anthropic's
 * "overloaded" status.
 */
const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504, 529]);

/** Provider message fragments that indicate a transient condition. */
const TRANSIENT_MESSAGE_RE =
  /high demand|overloaded|rate limit|resource(?:_| )?exhausted|too many requests|try again later|temporarily unavailable/i;

/**
 * Unwraps the AI SDK's `RetryError` wrapper (thrown once the SDK's built-in
 * retries are exhausted) to the underlying provider error.
 */
export function unwrapAiError(err: unknown): unknown {
  if (RetryError.isInstance(err) && err.lastError) {
    return err.lastError;
  }
  return err;
}

/** Returns the `message` of an unknown error value, or an empty string. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message.trim();
  }
  if (typeof err === 'string') {
    return err.trim();
  }
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as any).message || '').trim();
  }
  return '';
}

/**
 * Whether the error is a transient provider-side failure (high demand, rate
 * limiting, etc.) that is likely to succeed if the request is retried.
 */
export function isTransientAiError(err: unknown): boolean {
  const inner = unwrapAiError(err);
  if (APICallError.isInstance(inner)) {
    if (inner.statusCode !== undefined) {
      return TRANSIENT_STATUS_CODES.has(inner.statusCode);
    }
    if (inner.isRetryable) {
      return true;
    }
  }
  return TRANSIENT_MESSAGE_RE.test(errorMessage(inner));
}

/**
 * Formats an AI SDK error as a single user-facing message. Transient failures
 * are labelled as such and include the provider's own explanation so the user
 * knows the problem is on the provider's side and that a retry may help.
 */
export function formatAiErrorMessage(err: unknown): string {
  const inner = unwrapAiError(err);
  const detail = errorMessage(inner);
  const status = APICallError.isInstance(inner) ? inner.statusCode : undefined;
  const statusSuffix = status ? ` (HTTP ${status})` : '';
  if (isTransientAiError(inner)) {
    const explanation =
      detail || 'The provider is temporarily unable to handle the request.';
    return `The AI provider is temporarily unavailable${statusSuffix}. ${explanation} Please try again in a moment.`;
  }
  if (!detail) {
    return `An unexpected error occurred${statusSuffix}.`;
  }
  return `${detail}${statusSuffix}`;
}
