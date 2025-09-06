import packageJson from '../package.json' with {type: 'json'};

const SERVER_STARTUP_TS = String(Math.floor(new Date().getTime() / 1000));

/**
 * Returns a string that represents the server version. On local dev, the
 * current timestamp is returned. On prod, the package.json version is returned.
 */
export function getServerVersion(): string {
  // On local dev, use the timestamp when the server was started.
  if (process.env.NODE_ENV === 'development') {
    return SERVER_STARTUP_TS;
  }
  // On prod, return the version from `package.json`.
  return packageJson?.version || 'root-3.0.0';
}
