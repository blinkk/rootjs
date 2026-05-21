import {dim} from 'kleur/colors';
import type {Plugin} from 'vite';

/**
 * Vite plugin that removes 0-byte JS chunks from the build output and prunes
 * the import statements that reference them.
 *
 * Tree-shaking (via rolldown/esbuild) can reduce a module to nothing — e.g. a
 * type-only `.ts` file, or an entry whose contents are entirely eliminated.
 * rolldown still emits a file for every explicit input, so these surface as
 * 0-byte `.js` files in the build output. Worse, a sibling chunk may keep a
 * bare side-effect import (`import "./<hash>.js"`) pointing at the empty file.
 * If that empty file is removed without also removing the import, the import
 * 404s at runtime and breaks the entire module graph.
 *
 * This plugin runs in `generateBundle` (before Vite's manifest plugin) and:
 *   1. Detects chunks whose generated code is empty.
 *   2. Skips any that still anchor CSS or asset references, so co-located
 *      styles are preserved (Vite keeps an empty JS chunk to carry the CSS
 *      link for a style-only module).
 *   3. Strips bare side-effect imports of the empty chunks from sibling chunks.
 *      A 0-byte module exports nothing, so it can only be imported bare.
 *   4. Deletes the empty chunks from the bundle.
 *
 * Because it runs before the manifest is emitted, the resulting
 * `manifest.json` (consumed by Root's asset map) never references the removed
 * files.
 */
export function pruneEmptyChunksPlugin(): Plugin {
  return {
    name: 'root:prune-empty-chunks',
    generateBundle: {
      // Run before Vite's manifest plugin so the manifest reflects removals.
      order: 'pre',
      handler(_options, bundle) {
        const emptyChunks = new Set<string>();
        for (const [fileName, item] of Object.entries(bundle)) {
          if (item.type !== 'chunk' || item.code.trim() !== '') {
            continue;
          }
          // Keep empty chunks that still anchor CSS or asset references, since
          // removing them would drop those deps from the manifest.
          const css = item.viteMetadata?.importedCss;
          const assets = item.viteMetadata?.importedAssets;
          if ((css && css.size > 0) || (assets && assets.size > 0)) {
            continue;
          }
          emptyChunks.add(fileName);
        }
        if (emptyChunks.size === 0) {
          return;
        }

        // Remove references to the empty chunks from every sibling chunk.
        for (const item of Object.values(bundle)) {
          if (item.type !== 'chunk') {
            continue;
          }
          const referenced = new Set(
            [...(item.imports || []), ...(item.dynamicImports || [])].filter(
              (fileName) => emptyChunks.has(fileName)
            )
          );
          for (const emptyFileName of referenced) {
            item.code = removeSideEffectImport(item.code, emptyFileName);
          }
          if (item.imports) {
            item.imports = item.imports.filter((f) => !emptyChunks.has(f));
          }
          if (item.dynamicImports) {
            item.dynamicImports = item.dynamicImports.filter(
              (f) => !emptyChunks.has(f)
            );
          }
        }

        for (const fileName of emptyChunks) {
          delete bundle[fileName];
        }

        const removed = Array.from(emptyChunks).sort();
        console.log(
          `${dim('┃')} pruned ${removed.length} empty chunk(s): ${dim(
            removed.join(', ')
          )}`
        );
      },
    },
  };
}

/**
 * Removes bare side-effect imports of `fileName` from the given chunk code.
 *
 * The empty module has no exports, so it can only be imported via a bare
 * `import "..."` statement. The rendered specifier is a relative path ending
 * in the chunk's file name (e.g. `./abc.min.js` or `../chunks/abc.min.js`).
 */
function removeSideEffectImport(code: string, fileName: string): string {
  const base = fileName.split('/').pop() || fileName;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`import\\s*["'][^"']*${escaped}["']\\s*;?`, 'g');
  return code.replace(re, '');
}
