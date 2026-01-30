import crypto from 'node:crypto';

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
