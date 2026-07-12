import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {detectSkillsDirs} from './skill.js';

describe('detectSkillsDirs', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'root-skill-'));
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('detects an existing */skills directory', () => {
    fs.mkdirSync(path.join(root, '.agent/skills'), {recursive: true});
    expect(detectSkillsDirs(root)).toEqual([path.join(root, '.agent/skills')]);
  });

  it('detects a non-Claude provider skills directory', () => {
    fs.mkdirSync(path.join(root, '.cursor/skills'), {recursive: true});
    expect(detectSkillsDirs(root)).toEqual([path.join(root, '.cursor/skills')]);
  });

  it('detects multiple existing skills directories (sorted)', () => {
    fs.mkdirSync(path.join(root, '.claude/skills'), {recursive: true});
    fs.mkdirSync(path.join(root, '.agent/skills'), {recursive: true});
    expect(detectSkillsDirs(root)).toEqual([
      path.join(root, '.agent/skills'),
      path.join(root, '.claude/skills'),
    ]);
  });

  it('seeds skills/ for a known agent dir that exists without one', () => {
    fs.mkdirSync(path.join(root, '.claude'), {recursive: true});
    expect(detectSkillsDirs(root)).toEqual([path.join(root, '.claude/skills')]);
  });

  it('ignores non-agent dot dirs like .git', () => {
    fs.mkdirSync(path.join(root, '.git'), {recursive: true});
    expect(detectSkillsDirs(root)).toEqual([path.join(root, '.agent/skills')]);
  });

  it('falls back to .agent/skills when nothing is detected', () => {
    expect(detectSkillsDirs(root)).toEqual([path.join(root, '.agent/skills')]);
  });
});
