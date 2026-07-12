import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The name of the bundled skill directory. */
const SKILL_NAME = 'root-cms-cli';

/**
 * Known AI-agent config directories that use the `SKILL.md` "skills"
 * convention. Root stays agnostic of any particular AI provider: existing
 * skills directories are auto-detected regardless of provider, and this list
 * is only used to seed a sensible location when a provider's config dir exists
 * but doesn't have a `skills/` subdir yet.
 */
const KNOWN_AGENT_DIRS = ['.claude', '.agent'];

/** Neutral, provider-agnostic fallback when nothing else is detected. */
const DEFAULT_SKILLS_DIR = '.agent/skills';

export interface InstallSkillOptions {
  /** Overwrite the destination if it already exists. */
  force?: boolean;
}

/**
 * Installs the bundled `root-cms-cli` agent skill into the project's skills
 * directory (or directories).
 *
 * When no directory is given, existing agent skills directories are
 * auto-detected (e.g. `.claude/skills`, `.agent/skills`, or any other
 * `<dir>/skills` directory already present) so Root does not assume a specific
 * AI provider. If none is found, the skill is installed to `.agent/skills`.
 *
 * Usage:
 *   root-cms skill.install
 *   root-cms skill.install ./my-agent/skills
 *   root-cms skill.install --force
 */
export async function installSkill(
  dirArg: string | undefined,
  options?: InstallSkillOptions
) {
  const src = findSkillDir();
  const rootDir = process.cwd();
  const targets = dirArg ? [path.resolve(dirArg)] : detectSkillsDirs(rootDir);

  let installed = 0;
  for (const skillsDir of targets) {
    const dest = path.join(skillsDir, SKILL_NAME);
    if (fs.existsSync(dest)) {
      if (!options?.force) {
        console.log(
          `Skipped ${dest} (already installed; re-run with --force to overwrite)`
        );
        continue;
      }
      fs.rmSync(dest, {recursive: true, force: true});
    }
    fs.mkdirSync(skillsDir, {recursive: true});
    fs.cpSync(src, dest, {recursive: true});
    console.log(`Installed "${SKILL_NAME}" skill to ${dest}`);
    installed++;
  }

  if (installed === 0) {
    console.log('No skills installed.');
  }
}

/**
 * Detects where the skill should be installed, provider-agnostically:
 *
 * 1. Any existing `.<agent>/skills` directory at the project root (whatever
 *    provider it belongs to).
 * 2. Otherwise, a `skills/` subdir under any known agent config dir that
 *    already exists (e.g. `.claude`, `.agent`).
 * 3. Otherwise, the neutral `.agent/skills` fallback.
 *
 * Exposed for testing.
 */
export function detectSkillsDirs(rootDir: string): string[] {
  // 1. Existing "<dotdir>/skills" directories.
  const existing: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, {withFileTypes: true});
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('.')) {
      const skillsPath = path.join(rootDir, entry.name, 'skills');
      if (isDirectory(skillsPath)) {
        existing.push(skillsPath);
      }
    }
  }
  if (existing.length > 0) {
    return existing.sort();
  }

  // 2. Known agent config dirs present but without a skills subdir yet.
  const seeded: string[] = [];
  for (const agentDir of KNOWN_AGENT_DIRS) {
    if (isDirectory(path.join(rootDir, agentDir))) {
      seeded.push(path.join(rootDir, agentDir, 'skills'));
    }
  }
  if (seeded.length > 0) {
    return seeded;
  }

  // 3. Neutral fallback.
  return [path.join(rootDir, DEFAULT_SKILLS_DIR)];
}

/** Returns true if `p` exists and is a directory. */
function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Locates the bundled skill directory. The skill ships at `<package>/skills/`,
 * while the CLI runs from `dist/`, so a few candidate locations are checked.
 */
function findSkillDir(): string {
  const candidates = [
    path.resolve(__dirname, `../skills/${SKILL_NAME}`),
    path.resolve(__dirname, `../../skills/${SKILL_NAME}`),
    path.resolve(__dirname, `skills/${SKILL_NAME}`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'SKILL.md'))) {
      return candidate;
    }
  }
  throw new Error(
    `could not locate the "${SKILL_NAME}" skill (looked in: ${candidates.join(
      ', '
    )})`
  );
}
