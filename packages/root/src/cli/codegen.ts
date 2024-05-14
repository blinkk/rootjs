import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import glob from 'tiny-glob';
import {dirExists, makeDir, rmDir, writeFile} from '../utils/fsutils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CodegenOptions {
  out?: string;
}

interface Template {
  read: () => Promise<string>;
}

type TemplateMap = Record<string, Template>;

export async function codegen(
  type: string,
  name: string,
  options?: CodegenOptions
) {
  const rootDir = path.resolve(process.cwd());
  const project = new Project(rootDir);
  await project.generateCode(type, name, options);
}

class Project {
  rootDir: string;
  tplDirs: string[];

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.tplDirs = [
      path.join(rootDir, 'codegen'),
      path.join(__dirname, '../codegen'),
    ];
  }

  async generateCode(type: string, name: string, options?: CodegenOptions) {
    const files = await this.loadFiles(type);
    if (Object.keys(files).length === 0) {
      console.log(`no files in codegen/${type}/*.tpl`);
      return;
    }

    // By default, running `root codegen template Foo` outputs to
    // `<rootDir>/templates/Foo`.
    const outname = options?.out || `${type}s`;
    const outdir = path.join(this.rootDir, outname, name);
    if (await dirExists(outdir)) {
      await rmDir(outdir);
    }
    await makeDir(outdir);

    for (const tplName in files) {
      const tpl = await files[tplName].read();
      const content = tpl
        .replaceAll('[[name]]', name)
        .replaceAll('[[name:camel_upper]]', toCamelCaseUpper(name));
      const filename = tplName.replace('[name]', name);
      const filepath = path.join(outdir, filename);
      await writeFile(filepath, content);
      console.log(`saved ${filepath}`);
    }
  }

  /**
   * Searches the project's "codegen" dir (or fallsback to root's "codegen" dir)
   * and returns a `TemplateMap` for all files in `codgen/<type>/*.tpl`.
   */
  async loadFiles(type: string): Promise<TemplateMap> {
    for (const tplDir of this.tplDirs) {
      const typeDir = path.join(tplDir, type);
      if (await dirExists(typeDir)) {
        return this.loadTplFiles(typeDir);
      }
    }
    return {};
  }

  /**
   * Reads files matching `*.tpl` in a given directory.
   */
  private async loadTplFiles(dirpath: string): Promise<TemplateMap> {
    const tplFiles: TemplateMap = {};
    const files = await glob('*.tpl', {cwd: dirpath});
    for (const filename of files) {
      const filepath = path.join(dirpath, filename);
      // Remove `.tpl`.
      const name = filename.slice(0, -4);
      tplFiles[name] = {
        read: () => fs.readFile(filepath, 'utf-8'),
      };
    }
    return tplFiles;
  }
}

function toCamelCaseUpper(str: string) {
  const segments = str.split('-');
  return segments.map((part) => toTitleCase(part)).join('');
}

function toTitleCase(str: string) {
  const ch = String(str).charAt(0).toUpperCase();
  return `${ch}${str.slice(1)}`;
}
