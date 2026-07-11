import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The name of the bundled skill directory. */
const SKILL_NAME = 'root-cms-cli';

export interface InstallSkillOptions {
  /** Overwrite the destination if it already exists. */
  force?: boolean;
}

/**
 * Installs the bundled `root-cms-cli` agent skill into a local skills
 * directory (default: `.claude/skills`). The skill is copied to
 * `<dir>/root-cms-cli/`.
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
  const skillsDir = path.resolve(dirArg || '.claude/skills');
  const dest = path.join(skillsDir, SKILL_NAME);

  if (fs.existsSync(dest)) {
    if (!options?.force) {
      throw new Error(
        `skill already installed at ${dest}. Re-run with --force to overwrite.`
      );
    }
    fs.rmSync(dest, {recursive: true, force: true});
  }

  fs.mkdirSync(skillsDir, {recursive: true});
  fs.cpSync(src, dest, {recursive: true});
  console.log(`Installed "${SKILL_NAME}" skill to ${dest}`);
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
