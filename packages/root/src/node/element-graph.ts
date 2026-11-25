import fs from 'node:fs';
import path from 'node:path';
import glob from 'tiny-glob';
import {searchForWorkspaceRoot} from 'vite';
import {ElementTagNameMatcher, RootConfig} from '../core/config.js';
import {isValidTagName, parseTagNames} from '../utils/elements.js';
import {isDirectory, isJsFile} from '../utils/fsutils.js';
import type {ResolvedPod} from './pod-collector.js';

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
        delete this.deps[tagName];
        return true;
      }
    }
    const realTarget = resolveRealPathSync(resolved);
    for (const tagName in this.sourceFiles) {
      if (
        resolveRealPathSync(this.sourceFiles[tagName].filePath) === realTarget
      ) {
        delete this.deps[tagName];
        return true;
      }
    }
    return false;
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

export interface GetElementsOptions {
  /**
   * Whether the element graph is being built for the SSG phase of
   * `root build`. When true, elements matching `elements.excludeFromSsg` are
   * left out of the graph. The dev server and `root build --ssr-only` leave
   * this unset, since both render pages on demand and should keep serving the
   * excluded elements.
   */
  isSsgBuild?: boolean;
}

/**
 * Returns true if a tag name matches an `ElementTagNameMatcher`. Strings are
 * matched exactly, RegEx patterns are tested against the tag name, and a
 * function is called with the tag name.
 */
function matchesTagName(
  tagName: string,
  matcher: ElementTagNameMatcher
): boolean {
  if (typeof matcher === 'function') {
    return matcher(tagName);
  }
  return matcher.some((pattern) => {
    if (typeof pattern === 'string') {
      return pattern === tagName;
    }
    return Boolean(tagName.match(pattern));
  });
}

/**
 * Returns a map of all the element file definitions in the project.
 */
export async function getElements(
  rootConfig: RootConfig,
  pods?: ResolvedPod[],
  options?: GetElementsOptions
): Promise<ElementGraph> {
  const rootDir = rootConfig.rootDir;

  const elementsDirs = getElementsDirs(rootConfig, pods);
  const excludePatterns = rootConfig.elements?.exclude || [];
  const excludeElement = (moduleId: string) => {
    return excludePatterns.some((pattern) => Boolean(moduleId.match(pattern)));
  };

  // `elements.excludeFromSsg` matches tag names and only applies to the SSG
  // output, which keeps the excluded elements working anywhere pages are
  // rendered on demand (the dev server, `--ssr-only` builds).
  const excludeFromSsg = options?.isSsgBuild
    ? rootConfig.elements?.excludeFromSsg
    : undefined;
  const excludeTagName = (tagName: string) => {
    if (!excludeFromSsg) {
      return false;
    }
    return matchesTagName(tagName, excludeFromSsg);
  };

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
          if (!excludeElement(relPath) && !excludeTagName(tagName)) {
            elementFilePaths[tagName] = {filePath, relPath};
          }
        }
      });
    }
  }

  const graph = new ElementGraph(elementFilePaths);
  return graph;
}

/**
 * Resolves symlinks for `targetPath` when it exists, or resolves its nearest
 * existing ancestor and appends the remaining relative segments so non-existent
 * paths under symlinked roots compare consistently.
 */
function resolveRealPathSync(targetPath: string): string {
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

/**
 * Returns true when `target` is inside (or equal to) `dir`, resolving symlinks
 * consistently even when `target` does not yet exist on disk.
 */
function directoryContainsSync(dir: string, target: string): boolean {
  const outer = resolveRealPathSync(dir);
  const inner = resolveRealPathSync(target);
  const rel = path.relative(outer, inner);
  return (
    rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
  );
}

/**
 * Get all element dirs.
 */
export function getElementsDirs(rootConfig: RootConfig, pods?: ResolvedPod[]) {
  const rootDir = rootConfig.rootDir;

  const elementsDirs = [path.join(rootDir, 'elements')];
  const elementsInclude = rootConfig.elements?.include || [];

  if (elementsInclude.length > 0) {
    const workspaceRoot = searchForWorkspaceRoot(rootDir);
    for (const dirPath of elementsInclude) {
      const elementsDir = path.resolve(rootDir, dirPath);
      if (!directoryContainsSync(workspaceRoot, elementsDir)) {
        throw new Error(
          `the elements dir (${dirPath}) should be within the project's workspace (${workspaceRoot})`
        );
      }
      elementsDirs.push(elementsDir);
    }
  }

  // Pod-contributed element dirs bypass the workspace containment check
  // because they are trusted (registered by plugins, not user input).
  if (pods) {
    for (const pod of pods) {
      for (const dir of pod.elementsDirs) {
        elementsDirs.push(dir);
      }
    }
  }

  return elementsDirs;
}
