import {APICallError, RetryError} from 'ai';
import {describe, expect, test} from 'vitest';
import {
  formatAiErrorMessage,
  isTransientAiError,
  unwrapAiError,
} from './errors.js';

const HIGH_DEMAND =
  'This model is currently experiencing high demand. Spikes in demand are usually temporary.';

function apiError(statusCode: number, message: string) {
  return new APICallError({
    message,
    url: 'https://example.com',
    requestBodyValues: {},
    statusCode,
  });
}

describe('unwrapAiError', () => {
  test('returns the last error from a RetryError', () => {
    const inner = apiError(503, HIGH_DEMAND);
    const retry = new RetryError({
      message: `Failed after 3 attempts. Last error: ${HIGH_DEMAND}`,
      reason: 'maxRetriesExceeded',
      errors: [inner, inner, inner],
    });
    expect(unwrapAiError(retry)).toBe(inner);
  });

  test('passes other errors through', () => {
    const err = new Error('boom');
    expect(unwrapAiError(err)).toBe(err);
  });
});

describe('isTransientAiError', () => {
  test('treats 503 / 529 / 429 API errors as transient', () => {
    expect(isTransientAiError(apiError(503, HIGH_DEMAND))).toBe(true);
    expect(isTransientAiError(apiError(529, 'Overloaded'))).toBe(true);
    expect(isTransientAiError(apiError(429, 'Rate limited'))).toBe(true);
  });

  test('treats auth and validation API errors as permanent', () => {
    expect(isTransientAiError(apiError(401, 'Invalid API key'))).toBe(false);
    expect(isTransientAiError(apiError(400, 'Bad request'))).toBe(false);
  });

  test('looks through RetryError wrappers', () => {
    const retry = new RetryError({
      message: 'Failed after 3 attempts.',
      reason: 'maxRetriesExceeded',
      errors: [apiError(503, HIGH_DEMAND)],
    });
    expect(isTransientAiError(retry)).toBe(true);
  });

  test('recognizes high-demand wording in plain errors', () => {
    expect(isTransientAiError(new Error(HIGH_DEMAND))).toBe(true);
    expect(isTransientAiError(new Error('schema mismatch'))).toBe(false);
  });
});

describe('formatAiErrorMessage', () => {
  test('surfaces the provider message for transient failures', () => {
    const retry = new RetryError({
      message: 'Failed after 3 attempts.',
      reason: 'maxRetriesExceeded',
      errors: [apiError(503, HIGH_DEMAND)],
    });
    expect(formatAiErrorMessage(retry)).toBe(
      `The AI provider is temporarily unavailable (HTTP 503). ${HIGH_DEMAND} Please try again in a moment.`
    );
  });

  test('falls back to a generic explanation when the provider gives none', () => {
    expect(formatAiErrorMessage(apiError(529, ''))).toBe(
      'The AI provider is temporarily unavailable (HTTP 529). The provider is temporarily unable to handle the request. Please try again in a moment.'
    );
  });

  test('keeps the provider message for permanent failures', () => {
    expect(formatAiErrorMessage(apiError(401, 'Invalid API key'))).toBe(
      'Invalid API key (HTTP 401)'
    );
    expect(formatAiErrorMessage(new Error('schema mismatch'))).toBe(
      'schema mismatch'
    );
  });

  test('handles unknown error values', () => {
    expect(formatAiErrorMessage(undefined)).toBe(
      'An unexpected error occurred.'
    );
    expect(formatAiErrorMessage('plain string')).toBe('plain string');
  });
});
