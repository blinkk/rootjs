import fs from 'node:fs';
import path from 'node:path';
import {searchForWorkspaceRoot} from 'vite';
import {RootConfig} from '../core/config';
import {directoryContains, isDirectory, isJsFile} from '../utils/fsutils';
import glob from 'tiny-glob';
import {isValidTagName, parseTagNames} from '../utils/elements';

interface ElementSourceFile {
  /** Full file path. */
  filePath: string;
  /** Path relative to the root project directory. */
  relPath: string;
}

/**
 * Dependency graph for element files to capture which other elements are used
 * by any particular element.
 */
export class ElementGraph {
  /**
   * Element tagName => sourceFile.
   */
  readonly sourceFiles: {[tagName: string]: ElementSourceFile} = {};

  /**
   * Element tagName => set of element tagName dependencies.
   */
  private deps: Record<string, string[]> = {};

  constructor(sourceFiles: {[tagName: string]: ElementSourceFile}) {
    this.sourceFiles = sourceFiles;
  }

  toJson() {
    for (const tagName in this.sourceFiles) {
      this.deps[tagName] ??= this.parseDepsFromSource(tagName);
    }
    return {
      sourceFiles: this.sourceFiles,
      deps: this.deps,
    };
  }

  static fromJson(data: {deps: any; sourceFiles: any}) {
    const graph = new ElementGraph(data.sourceFiles);
    graph.deps = data.deps;
    return graph;
  }

  getDeps(tagName: string, visited?: Set<string>): string[] {
    visited ??= new Set();
    if (visited.has(tagName)) {
      return [];
    }

    visited.add(tagName);
    this.deps[tagName] ??= this.parseDepsFromSource(tagName);

    const deps = new Set(this.deps[tagName]);
    for (const depTagName of this.deps[tagName]) {
      for (const childDep of this.getDeps(depTagName, visited)) {
        deps.add(childDep);
      }
    }
    return Array.from(deps);
  }

  /**
   * Parses an element's source file for usage of other custom elements.
   */
  private parseDepsFromSource(tagName: string): string[] {
    const srcFile = this.sourceFiles[tagName];
    if (!srcFile) {
      throw new Error(`could not find file path for tagName <${tagName}>`);
    }
    const src = fs.readFileSync(srcFile.filePath, 'utf-8');
    const tagNames = parseTagNames(src);
    const deps = new Set<string>();
    for (const depTagName of tagNames) {
      if (depTagName !== tagName && depTagName in this.sourceFiles) {
        deps.add(depTagName);
      }
    }
    return Array.from(deps);
  }
}

/**
 * Returns a map of all the element file definitions in the project.
 */
export async function getElements(
  rootConfig: RootConfig
): Promise<ElementGraph> {
  const rootDir = rootConfig.rootDir;
  const workspaceRoot = searchForWorkspaceRoot(rootDir);

  const elementsDirs = [path.join(rootDir, 'elements')];
  const elementsInclude = rootConfig.elements?.include || [];
  const excludePatterns = rootConfig.elements?.exclude || [];
  const excludeElement = (moduleId: string) => {
    return excludePatterns.some((pattern) => Boolean(moduleId.match(pattern)));
  };

  for (const dirPath of elementsInclude) {
    const elementsDir = path.resolve(rootDir, dirPath);
    if (!directoryContains(rootDir, elementsDir)) {
      throw new Error(
        `the elements dir (${dirPath}) should be within the project's workspace (${workspaceRoot})`
      );
    }
    elementsDirs.push(elementsDir);
  }

  const elementFilePaths: {[tagName: string]: ElementSourceFile} = {};
  for (const dirPath of elementsDirs) {
    if (await isDirectory(dirPath)) {
      const files = await glob('**/*', {cwd: dirPath});
      files.forEach((file) => {
        const parts = path.parse(file);
        if (isJsFile(parts.base) && isValidTagName(parts.name)) {
          const tagName = parts.name;
          const filePath = path.join(dirPath, file);
          const relPath = path.relative(rootDir, filePath);
          if (!excludeElement(relPath)) {
            elementFilePaths[tagName] = {filePath, relPath};
          }
        }
      });
    }
  }

  const graph = new ElementGraph(elementFilePaths);
  return graph;
}
