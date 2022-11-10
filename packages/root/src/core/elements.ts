import fs from 'node:fs';
import path from 'node:path';
import glob from 'tiny-glob';
import {ElementModule} from 'virtual:root-elements';
import {searchForWorkspaceRoot} from 'vite';
import {RootConfig} from './config';
import {directoryContains, isDirectory, isJsFile} from './fsutils';

/**
 * Returns a map of all the element file definitions in the project.
 */
export async function getElements(
  rootConfig: RootConfig
): Promise<Record<string, ElementModule>> {
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

  const elementMap: Record<string, ElementModule> = {};
  for (const dirPath of elementsDirs) {
    if (await isDirectory(dirPath)) {
      const elementFiles = await glob('**/*', {cwd: dirPath});
      elementFiles.forEach((file) => {
        const parts = path.parse(file);
        if (isJsFile(parts.base)) {
          const filePath = path.join(dirPath, file);
          const src = path.relative(rootDir, filePath);
          const realPath = fs.realpathSync(filePath);
          if (!excludeElement(src)) {
            elementMap[parts.name] = {
              src,
              filePath,
              realPath,
            };
          }
        }
      });
    }
  }
  return elementMap;
}
