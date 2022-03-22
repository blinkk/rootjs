import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

type Env = {[key: string]: string};
interface EnvFile {
  path: string;
  contents: string;
}
let cachedEnv: Env | undefined = undefined;
const cachedLoadedEnvFiles: EnvFile[] = [];

export function loadEnv(
  dirPath: string,
  options: {mode: 'development' | 'production'}
) {
  if (cachedEnv) {
    return {env: cachedEnv, loadedEnvFiles: cachedLoadedEnvFiles};
  }

  const dotenvFiles = [
    `.env.${options.mode}.local`,
    '.env.local',
    `.env.${options.mode}`,
    '.env',
  ];

  for (const envFile of dotenvFiles) {
    const dotEnvPath = path.join(dirPath, envFile);
    try {
      const stats = fs.statSync(dotEnvPath);
      if (!stats.isFile()) {
        continue;
      }

      const contents = fs.readFileSync(dotEnvPath, 'utf8');
      cachedLoadedEnvFiles.push({
        path: envFile,
        contents,
      });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`failed to load env from ${envFile}`, err);
      }
    }
  }
  cachedEnv = processEnv(dirPath, cachedLoadedEnvFiles);
  return {env: cachedEnv, loadedEnvFiles: cachedLoadedEnvFiles};
}

function processEnv(dirPath: string, envFiles: EnvFile[]): Env {
  if (process.env.__CMS_PROCESSED_ENV || envFiles.length === 0) {
    return process.env as Env;
  }
  process.env.__CMS_PROCESSED_ENV = 'true';

  const origEnv = Object.assign({}, process.env);
  const parsed: dotenv.DotenvParseOutput = {};

  for (const envFile of envFiles) {
    try {
      const result: dotenv.DotenvConfigOutput = {};
      result.parsed = dotenv.parse(envFile.contents);
      // If $VAR expansion is eventually needed, uncomment the following line
      // and `pnpm install dotenv-expand`.
      // result = dotenvExpand(result);

      if (result.parsed) {
        console.info(`loaded ${path.join(dirPath || '', envFile.path)}`);
      }

      for (const key of Object.keys(result.parsed || {})) {
        if (
          typeof parsed[key] === 'undefined' &&
          typeof origEnv[key] === 'undefined'
        ) {
          parsed[key] = result.parsed?.[key];
        }
      }
    } catch (err) {
      console.error(
        `failed to load env from ${path.join(dirPath || '', envFile.path)}`,
        err
      );
    }
  }

  return Object.assign(process.env, parsed);
}
