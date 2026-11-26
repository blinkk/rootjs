import fs from 'node:fs';
import path from 'node:path';
import {parseTagNames} from '../utils/elements.js';

/**
 * Source file metadata for a custom element in the element graph.
 */
export interface ElementSourceFile {
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

  /**
   * Element tagName => memoized transitive element tagName dependencies.
   */
  private transitiveDeps: Record<string, string[]> = Object.create(null);

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
    if (visited) {
      // An explicit visited set bypasses the memo cache, since the result
      // depends on which elements were already visited.
      return this.walkDeps(tagName, visited);
    }
    if (!Object.hasOwn(this.transitiveDeps, tagName)) {
      this.transitiveDeps[tagName] = this.walkDeps(tagName, new Set());
    }
    return this.transitiveDeps[tagName].slice();
  }

  /**
   * Recursively collects transitive element dependencies. An element's direct
   * deps are listed before the deps of its deps.
   */
  private walkDeps(tagName: string, visited: Set<string>): string[] {
    if (visited.has(tagName)) {
      return [];
    }
    visited.add(tagName);
    const directDeps = (this.deps[tagName] ??=
      this.parseDepsFromSource(tagName));
    const deps = new Set(directDeps);
    for (const depTagName of directDeps) {
      for (const childDep of this.walkDeps(depTagName, visited)) {
        deps.add(childDep);
      }
    }
    return Array.from(deps);
  }

  /**
   * Clears cached dependencies for the element matching `filePath`, if any.
   */
  invalidateFile(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    for (const tagName in this.sourceFiles) {
      if (path.resolve(this.sourceFiles[tagName].filePath) === resolved) {
        this.invalidateTagName(tagName);
        return true;
      }
    }
    const realTarget = resolveRealPathSync(resolved);
    for (const tagName in this.sourceFiles) {
      if (
        resolveRealPathSync(this.sourceFiles[tagName].filePath) === realTarget
      ) {
        this.invalidateTagName(tagName);
        return true;
      }
    }
    return false;
  }

  /**
   * Clears the element's direct deps and the whole transitive deps memo, since
   * any element that (transitively) depends on it may now be stale.
   */
  private invalidateTagName(tagName: string) {
    delete this.deps[tagName];
    this.transitiveDeps = Object.create(null);
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
 * Resolves symlinks for `targetPath` when it exists, or resolves its nearest
 * existing ancestor and appends the remaining relative segments so non-existent
 * paths under symlinked roots compare consistently.
 */
export function resolveRealPathSync(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  const tail: string[] = [];
  let current = resolved;
  while (true) {
    try {
      const real = fs.realpathSync(current);
      return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return resolved;
      }
      tail.push(path.basename(current));
      current = parent;
    }
  }
}
