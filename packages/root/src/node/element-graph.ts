import path from 'node:path';
import glob from 'tiny-glob';
import {searchForWorkspaceRoot} from 'vite';
import {ElementTagNameMatcher, RootConfig} from '../core/config.js';
import {isValidTagName} from '../utils/elements.js';
import {isDirectory, isJsFile} from '../utils/fsutils.js';
import {
  ElementGraph,
  ElementSourceFile,
  resolveRealPathSync,
} from './element-graph-runtime.js';
import type {ResolvedPod} from './pod-collector.js';

export {ElementGraph, resolveRealPathSync};
export type {ElementSourceFile};

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
 * Returns true when `target` is lexically inside (or equal to) `dir`.
 */
function isPathInside(dir: string, target: string): boolean {
  const rel = path.relative(dir, target);
  return (
    rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
  );
}

/**
 * Returns true when `target` is inside (or equal to) `dir`, checking lexical
 * containment first (so symlinked packages under `node_modules` whose realpath
 * resolves outside the workspace are allowed) and falling back to realpath
 * containment for symlinked workspace roots.
 */
function directoryContainsSync(dir: string, target: string): boolean {
  const resolvedDir = path.resolve(dir);
  const resolvedTarget = path.resolve(target);
  if (isPathInside(resolvedDir, resolvedTarget)) {
    return true;
  }
  const outer = resolveRealPathSync(resolvedDir);
  const inner = resolveRealPathSync(resolvedTarget);
  return isPathInside(outer, inner);
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
