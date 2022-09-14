import path from 'node:path';
import {build} from '../dist/cli';
import {rmDir} from '../src/core/fsutils';

export class Fixture {
  rootDir: string;
  distDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.distDir = path.join(this.rootDir, 'dist');
  }

  async build() {
    await build(this.rootDir);
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
