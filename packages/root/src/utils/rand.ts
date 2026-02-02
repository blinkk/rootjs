import crypto from 'node:crypto';

import {RootConfig} from '../core/config.js';

export function randString(len: number): string {
  const result = [];
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < len; i++) {
    const rand = Math.floor(Math.random() * chars.length);
    result.push(chars.charAt(rand));
  }
  return result.join('');
}

/**
 * Generates a deterministic session secret based on a seed string (e.g., project path).
 * This ensures the same secret is generated for the same seed across dev server restarts,
 * while still allowing different projects to have unique secrets.
 */
function deterministicSessionSecret(seed: string): string {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

/**
 * Gets the session cookie secret for the server.
 *
 * Returns the configured session cookie secret, or generates one if not provided:
 * - In development: uses a deterministic secret based on rootDir for session persistence
 * - In production: generates a random secret (sessions won't persist across restarts)
 */
export function getSessionCookieSecret(
  rootConfig: RootConfig,
  rootDir: string
): string | string[] {
  // Use configured secret if provided.
  if (rootConfig.server?.sessionCookieSecret) {
    return rootConfig.server.sessionCookieSecret;
  }

  // Use deterministic secret in dev mode for consistent sessions across server restarts.
  if (process.env.NODE_ENV === 'development') {
    return deterministicSessionSecret(rootDir);
  }

  return randString(36);
}
