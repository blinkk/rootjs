import crypto from 'node:crypto';
import {Response} from '@blinkk/root';

export function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

export function setSecurityHeaders(res: Response, nonce: string) {
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  res.setHeader(
    'strict-transport-security',
    'max-age=63072000; includeSubdomains; preload'
  );
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-xss-protection', '1; mode=block');

  // https://csp.withgoogle.com/docs/strict-csp.html
  const directives = [
    "base-uri 'none'",
    "object-src 'none'",
    `script-src 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' 'strict-dynamic' https: http:`,
  ];
  res.setHeader('content-security-policy-report-only', directives.join(';'));
}
