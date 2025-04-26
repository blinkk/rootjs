import path from 'node:path';
import {build, BuildOptions} from '../dist/cli.js';
import {rmDir} from '../src/utils/fsutils.js';

export class Fixture {
  rootDir: string;
  distDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.distDir = path.join(this.rootDir, 'dist');
  }

  async build(options?: BuildOptions) {
    await build(this.rootDir, options);
  }

  async cleanup() {
    // Remove dist/ dir.
    await rmDir(this.distDir);
  }
}

export async function loadFixture(fixturePath: string) {
  const rootDir = path.resolve(__dirname, fixturePath);
  return new Fixture(rootDir);
}
