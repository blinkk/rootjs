> `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md`.

## Project Structure

### Packages (`packages/`)

- **@blinkk/root** (`packages/root`): The core framework package.
- **@blinkk/root-cms** (`packages/root-cms`): The CMS integration for Root.js.
- **create-root** (`packages/create-root`): Project scaffolding CLI.
- **@blinkk/root-password-protect** (`packages/root-password-protect`): Password-protection middleware.
- **@blinkk/eslint-config-root** (`packages/eslint-config-root`): Shared eslint config.

### Documentation (`docs/`)

Contains documentation for the project, powering `rootjs.dev`. It's a real
Root.js project (`@private/docs`) and doubles as the local playground for
testing framework and CMS changes.

### Examples (`examples/`)

Contains example projects demonstrating various features of Root.js
(`@examples/blog`, `@examples/starter`, `@examples/cms`, `@examples/minimal`,
`@examples/basepath`).

### Apps (`apps/`)

Internal support apps (e.g. `@private/mock-localllm`), not published.

## Development

- **Package Manager**: `pnpm`
- **Build System**: `turbo`
- **Linting**: `eslint`
- **Node**: 24 (see `.node-version`); packages declare `engines.node >= 24`.
- `auto-install-peers=false` — peer dependencies must be added explicitly.

### Building

- Packages are bundled with esbuild via `scripts/build-esbuild.mjs` plus a
  per-package `esbuild.config.json`.
- `dist/` is generated output — never edit it by hand.
- `pnpm build` at the repo root only builds `--filter="@blinkk/*"`.
- Virtual modules are listed as esbuild `external` (see below).

### Testing

Tests use `vitest`. `pnpm test` at the root builds first, then runs
`turbo run test`.

- **root-cms unit tests run inside the Firestore emulator**
  (`firebase emulators:exec`, port 4107 per `packages/root-cms/firebase.json`)
  and require a build first. Running bare `vitest` in that package produces
  confusing connection failures.
- **Visual tests are a separate suite**: files named `*.visual.test.tsx`, run
  with `pnpm test:visual` (Playwright/Chromium, `vitest.config.visual.ts`).
  Golden images live in a colocated `__screenshots__/` directory; regenerate
  them with `pnpm test:visual --update`. See
  `packages/root-cms/VISUAL_TESTING.md`.
- Virtual modules must be stubbed in tests — `packages/root-cms/vitest.config.ts`
  already stubs `virtual:root/schemas`.

## Architecture Notes

### root-cms directory boundaries

Respect these — putting code in the wrong layer is the most common mistake:

- `core/` — node/server code (Firestore access, plugin, API, CLI support),
  built for `node24`.
- `ui/` — the browser SPA bundle (Preact).
- `shared/` — isomorphic code safe for both.
- `browser-client/`, `cli/`, `signin/` — separate entry points.

Never import node-only `core/` code into `ui/`; put shared logic in `shared/`.

### Virtual modules

`virtual:root/routes`, `virtual:root/schemas`, and `virtual:root/translations`
are generated at build time by the Vite plugin. They're marked `external` in
the esbuild configs and must be stubbed in vitest.

### Firestore data model

```
Projects/{projectId}
  /Collections/{collectionId}/Drafts/{slug}
  /Collections/{collectionId}/Drafts/{slug}/Versions/{timestamp}
  /Collections/{collectionId}/Published/{slug}
  /Collections/{collectionId}/Scheduled/{slug}
  /Releases/{releaseId}
  /DataSources/{dataSourceId}
  /Translations/{sha1}
  /Emails/{emailId}
```

Access control is role-based on the project doc: `ADMIN`, `EDITOR`,
`CONTRIBUTOR`, `VIEWER` (see `packages/root-cms/core/security.ts` and the
security rules in `packages/root-cms/README.md`).

### Root project layout

Applies to `docs/` and everything under `examples/`:

- `routes/` — file-based routing (`[[...page]].tsx`, `404.tsx`, etc.).
- `collections/*.schema.ts` — CMS collection schemas.
- `elements/<tag-name>/<tag-name>.ts` — custom elements, auto-registered.
- `templates/<Name>/` — `<Name>.tsx` + `<Name>.schema.ts` + `<Name>.module.scss`.
- `bundles/`, `plugins/`, `styles/`, `root.config.ts`.
- Styles are `.module.scss` colocated with the component.

Schema APIs (`defineSchema`, `defineCollection`, and the field builders like
`string`, `array`, `oneOf`, `richtext`) live in
`packages/root-cms/core/schema.ts`.

### ROOT.md

A `ROOT.md` at a Root project's root is **not** a config file — its contents
are appended to the CMS AI system prompt for that project.

## Best Practices for Agents

### UI Development

- Avoid manually importing custom element definitions (these are collected by Root.js during the build process).
- The CMS UI is Preact + Mantine. **Mantine is pinned to 4.2.12** due to Preact
  compat issues; `react`/`react-dom` are aliased to `@preact/compat`. Don't
  upgrade Mantine casually.
- Components live at `ui/components/<Name>/<Name>.tsx` with a colocated plain
  `<Name>.css` whose root class is the component name.
- Use `joinClassNames` from `ui/utils/classes.js` for conditional classes,
  icons from `@tabler/icons-preact`, and notifications via
  `ui/utils/notifications.js`.

### Version Control & Contributions

- **Commit Messages**: Follow the conventional commit format. Use `feat` for new features, `fix` for bug fixes, `ci` for github actions workflows, `chore` for general cleanups / style tweaks / etc. Avoid other prefixes and don't include the package name (bad: `feat(root-cms): lorem ipsum`, good: `feat: lorem ipsum`).
- **Changesets**: Run `pnpm changeset` when a change is worth mentioning in the changelog. Skip minor bug fixes and style changes. Use "patch" versioning only, and a single-line message matching the first line of the commit message.
- **Linting**: Run `pnpm lint` and ensure it passes.

### Code Conventions

- **Comments**: All comments (block and inline) MUST end in punctuation. Use block comments to describe interfaces and their fields, and to briefly describe new classes, hooks, and components. For very complex functionality, include a usage example. Avoid superfluous comments.
- **Imports**: Everything is ESM. Relative imports MUST use the `.js`
  extension, even from `.ts`/`.tsx` files. Import order is alphabetized and
  enforced by `import-x/order`.

### PR Instructions

- **Title**: Use the first line of the commit message.
- **Model Name**: Include the model name in the description, e.g. "Generated with <App> (<Model Name>)".
