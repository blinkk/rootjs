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
export function deterministicSessionSecret(seed: string): string {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

/**
 * Gets the session cookie secret for the server.
 *
 * Priority order:
 * 1. Explicit config value (rootConfig.server.sessionCookieSecret)
 * 2. Development mode: deterministic secret based on rootDir (sessions persist across restarts)
 * 3. Production mode: random secret with security warning
 */
export function getSessionCookieSecret(
  rootConfig: RootConfig,
  rootDir: string
): string | string[] {
  if (rootConfig.server?.sessionCookieSecret) {
    return rootConfig.server.sessionCookieSecret;
  }

  if (process.env.NODE_ENV === 'development') {
    return deterministicSessionSecret(rootDir);
  }

  return randString(36);
}
