/**
 * Loads a TS config file using require() and then deletes the imported module
 * from cache. The cache delete allows for the config file to be re-loaded
 * if the file changes.
 */
export async function loadConfigPath<T>(configPath: string): Promise<T> {
  const config = require(configPath).default as T;
  delete require.cache[require.resolve(configPath)];
  return config;
}
