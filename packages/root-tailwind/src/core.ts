import {Plugin} from '@blinkk/root';
import path from 'node:path';
import {createRequire} from 'node:module';
import {PluginOption} from 'vite';

const require = createRequire(import.meta.url);

const DEFAULT_STYLESHEET_CONTENT = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

const DEFAULT_CONTENT_GLOBS = [
  './routes/**/*.{ts,tsx,js,jsx,md,mdx}',
  './layouts/**/*.{ts,tsx,js,jsx,md,mdx}',
  './components/**/*.{ts,tsx,js,jsx,md,mdx}',
  './templates/**/*.{ts,tsx,js,jsx,md,mdx}',
  './elements/**/*.{ts,tsx,js,jsx,md,mdx}',
];

export interface RootTailwindOptions {
  /**
   * Path to the stylesheet entry file relative to the project root.
   */
  stylesheetEntry?: string;

  /**
   * Tailwind content globs. If omitted, conventions for Root projects are used.
   */
  content?: string[];
}

/**
 * Root.js plugin that wires Tailwind into Vite and auto-imports a default
 * stylesheet entry into route modules so Root can auto-inject generated CSS.
 */
export function rootTailwind(options: RootTailwindOptions = {}): Plugin {
  const stylesheetEntry = options.stylesheetEntry || 'styles/index.css';
  const entryImportPath = toImportPath(stylesheetEntry);
  const contentGlobs = options.content || DEFAULT_CONTENT_GLOBS;

  return {
    name: 'root-tailwind',
    vitePlugins: [
      createTailwindPostcssPlugin(contentGlobs),
      createStylesheetAutoImportPlugin(entryImportPath),
    ],
  };
}

/**
 * Normalizes a project-relative entry path for use in JS import statements.
 */
function toImportPath(filepath: string): string {
  const normalized = filepath.split(path.sep).join('/').replace(/^\/+/, '');
  return `/${normalized}`;
}

/**
 * Loads the Tailwind PostCSS plugin and appends it to Vite CSS processing.
 */
function createTailwindPostcssPlugin(contentGlobs: string[]): PluginOption {
  return {
    name: 'root-tailwind-postcss',
    config() {
      const tailwindcss = require('tailwindcss');
      const tailwindPlugin = tailwindcss({
        content: contentGlobs,
      });

      return {
        css: {
          postcss: {
            plugins: [tailwindPlugin],
          },
        },
      };
    },
  };
}

/**
 * Injects the default stylesheet import into route modules.
 */
function createStylesheetAutoImportPlugin(
  entryImportPath: string
): PluginOption {
  const routeFileRegex = /\/routes\/.*\.(tsx|jsx)$/;
  return {
    name: 'root-tailwind-route-stylesheet',
    enforce: 'pre',
    transform(code, id) {
      const [idWithoutQuery] = id.split('?', 1);
      const normalizedId = idWithoutQuery.split(path.sep).join('/');
      if (!routeFileRegex.test(normalizedId)) {
        return null;
      }

      const importLine = `import '${entryImportPath}';`;
      if (code.includes(importLine)) {
        return null;
      }

      return `${importLine}\n${code}`;
    },
  };
}

export {DEFAULT_CONTENT_GLOBS, DEFAULT_STYLESHEET_CONTENT};
