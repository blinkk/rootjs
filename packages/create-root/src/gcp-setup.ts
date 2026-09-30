import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

import {dim} from 'kleur/colors';

export interface GcpSetupOptions {
  /** Skip the prompt and never run setup. */
  skip?: boolean;
  /** Package manager to install with, e.g. `pnpm`. */
  packageManager: string;
}

/**
 * After a template is copied, offers to install dependencies and run
 * `root-cms setup`, which walks the user through setting up Google Cloud.
 * Only offered for templates that use Root CMS, and only in a terminal.
 * Returns true if setup ran.
 */
export async function maybeRunGcpSetup(
  outputDir: string,
  options: GcpSetupOptions
): Promise<boolean> {
  if (options.skip || !process.stdin.isTTY || !(await usesRootCms(outputDir))) {
    return false;
  }
  console.log();
  const ok = await confirm(
    'This template uses Root CMS, which needs a Google Cloud project. Set one up now?'
  );
  if (!ok) {
    console.log(
      dim(
        `┃ Run \`${options.packageManager} exec root-cms setup\` when you're ready.`
      )
    );
    return false;
  }
  const pm = options.packageManager;
  try {
    console.log(dim(`┃ running ${pm} install...`));
    await run(pm, ['install'], outputDir);
    await run(pm, ['exec', 'root-cms', 'setup'], outputDir);
    return true;
  } catch (err: any) {
    console.log();
    console.log(`Google Cloud setup didn't finish: ${err.message}`);
    console.log(
      dim(
        `┃ Run \`${pm} exec root-cms setup\` in the project to pick up where it left off.`
      )
    );
    return false;
  }
}

/** Guesses the package manager the user ran `create` with. */
export function detectPackageManager(): string {
  const agent = process.env.npm_config_user_agent || '';
  if (agent.startsWith('yarn')) {
    return 'yarn';
  }
  if (agent.startsWith('npm')) {
    return 'npm';
  }
  return 'pnpm';
}

async function usesRootCms(dir: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(
      await fs.promises.readFile(path.join(dir, 'package.json'), 'utf8')
    );
    return Boolean(
      pkg.dependencies?.['@blinkk/root-cms'] ||
      pkg.devDependencies?.['@blinkk/root-cms']
    );
  } catch {
    return false;
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await rl.question(`${question} (Y/n) `))
      .trim()
      .toLowerCase();
    return answer === '' || answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      // Package managers are .cmd shims on Windows.
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}
