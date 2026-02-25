# @blinkk/root-tailwind

Tailwind integration plugin for Root.js.

## Install

```bash
pnpm add @blinkk/root-tailwind tailwindcss postcss
```

## Usage (`root.config.ts`)

```ts
import {defineConfig} from '@blinkk/root';
import {rootTailwind} from '@blinkk/root-tailwind';

export default defineConfig({
  plugins: [rootTailwind()],
});
```

The plugin expects a project stylesheet at `styles/index.css` and injects an
import into route modules so Root includes generated CSS through its existing
asset dependency auto-injection flow.

Create `styles/index.css` with Tailwind directives:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Plugin options

```ts
rootTailwind({
  stylesheetEntry: 'styles/index.css',
  content: [
    './routes/**/*.{ts,tsx,js,jsx,md,mdx}',
    './layouts/**/*.{ts,tsx,js,jsx,md,mdx}',
    './components/**/*.{ts,tsx,js,jsx,md,mdx}',
    './templates/**/*.{ts,tsx,js,jsx,md,mdx}',
  ],
});
```

- `stylesheetEntry`: Relative path to the CSS entry Root should auto-include.
- `content`: Tailwind content globs used by the injected PostCSS Tailwind
  plugin. Defaults are tuned for common Root directories.

## Migration from manual `<link rel="stylesheet">`

If you were manually adding a stylesheet link in `<Head>`, remove it and let
Root auto-inject styles from module dependencies instead:

1. Add `rootTailwind()` to `root.config.ts`.
2. Create `styles/index.css` with Tailwind directives.
3. Remove manual stylesheet `<link>` tags that pointed at your compiled CSS.

This keeps CSS loading aligned with Root’s SSR/dev dependency graph.
