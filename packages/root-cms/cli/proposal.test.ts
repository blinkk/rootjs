import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {proposalCheck} from './proposal.js';

const VALID = `version: 1
id: hero-refresh
title: Refresh the hero
changes:
  - kind: doc.edit
    docId: Pages/home
    ops:
      - op: set
        path: hero.title
        before: "Old"
        after: "New"
  - kind: release.create
    releaseId: q3
    ops:
      - op: set
        path: description
        after: "Q3"
`;

describe('proposalCheck', () => {
  let dir: string;
  let stdout: string;
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-proposal-'));
    stdout = '';
    process.exitCode = undefined;
    writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdout += String(chunk);
        return true;
      });
  });

  afterEach(() => {
    writeSpy.mockRestore();
    fs.rmSync(dir, {recursive: true, force: true});
    process.exitCode = undefined;
  });

  function write(name: string, contents: string): string {
    const filepath = path.join(dir, name);
    fs.writeFileSync(filepath, contents);
    return filepath;
  }

  it('reports a summary of the changes for a valid proposal', async () => {
    await proposalCheck(write('ok.yaml', VALID));
    const envelope = JSON.parse(stdout);
    expect(envelope.ok).toBe(true);
    expect(envelope.result.id).toBe('hero-refresh');
    expect(envelope.result.changes).toEqual([
      {index: 0, kind: 'doc.edit', target: 'Pages/home'},
      {index: 1, kind: 'release.create', target: 'q3'},
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  it('fails with a line-referenced error for an invalid proposal', async () => {
    await proposalCheck(
      write(
        'bad.yaml',
        'version: 1\nid: x\nchanges:\n  - kind: doc.edit\n    docId: Pages/home\n    ops:\n      - op: nope\n        path: a\n        after: "b"\n'
      )
    );
    const envelope = JSON.parse(stdout);
    expect(envelope.ok).toBe(false);
    expect(envelope.error).toMatch(/invalid proposal/);
    expect(envelope.error).toMatch(/bad\.yaml:7/);
    expect(process.exitCode).toBe(1);
  });

  it('fails when the file does not exist', async () => {
    await proposalCheck(path.join(dir, 'missing.yaml'));
    const envelope = JSON.parse(stdout);
    expect(envelope.ok).toBe(false);
    expect(envelope.error).toMatch(/file not found/);
    expect(process.exitCode).toBe(1);
  });

  it('emits exactly one line of JSON', async () => {
    await proposalCheck(write('ok.yaml', VALID));
    expect(stdout.trimEnd().split('\n')).toHaveLength(1);
  });
});
