> `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md`.

## Project Structure

- `packages/root` (**@blinkk/root**) — the core framework.
- `packages/root-cms` (**@blinkk/root-cms**) — the CMS integration. Most changes
  land here, and mostly in `ui/`.
- Also in `packages/`: `create-root` (scaffolding CLI), `root-password-protect`,
  `eslint-config-root`.
- `docs/` — powers `rootjs.dev`. It's a real Root.js project (`@private/docs`)
  and the local playground for testing framework/CMS changes.
- `examples/` — example projects. `apps/` — internal, unpublished.

## Development

`pnpm` + `turbo` + `eslint`. Node 24 (`.node-version`); packages declare
`engines.node >= 24`.

### Building

Packages bundle with esbuild via `scripts/build-esbuild.mjs` plus a per-package
`esbuild.config.json`. `dist/` is generated output — never edit it by hand.
`pnpm build` at the root only builds `--filter="@blinkk/*"`.

### Testing

Tests use `vitest`. `pnpm test` builds first, then runs `turbo run test`.

- **root-cms unit tests run inside the Firestore emulator**
  (`firebase emulators:exec`, port 4107) and require a build first. Running bare
  `vitest` in that package fails confusingly. The emulator needs a JDK, and
  `firebase-tools` >= 15 requires **Java 21 or above**.
- **Visual tests are a separate suite**: files named `*.visual.test.tsx`, run
  with `pnpm test:visual` (Playwright/Chromium). Goldens live in a colocated
  `__screenshots__/`; regenerate with `pnpm test:visual --update`.

## Architecture Notes

### root-cms layers

- `core/` — node/server code (Firestore, plugin, API)
- `ui/` — the browser SPA (Preact). Most work happens here.
- `shared/` — isomorphic code safe for both.
- `browser-client/`, `cli/`, `signin/` — separate entry points.

Never import node-only `core/` code into `ui/`; put shared logic in `shared/`.

### Virtual modules

`virtual:root/routes`, `virtual:root/schemas`, and `virtual:root/translations`
are generated at build time, marked `external` in the esbuild configs, and must
be stubbed in vitest (see `packages/root-cms/vitest.config.ts`).

### Firestore data model

```
Projects/{projectId}
  /Collections/{collectionId}/{Drafts|Published|Scheduled}/{slug}
  /Collections/{collectionId}/Drafts/{slug}/Versions/{timestamp}
  /Releases  /DataSources  /Translations  /Emails
```

Roles on the project doc: `ADMIN`, `EDITOR`, `CONTRIBUTOR`, `VIEWER` (see
`packages/root-cms/core/security.ts`).

### Root project layout

Applies to `docs/` and `examples/*`: `routes/` (file-based routing),
`collections/*.schema.ts`, `elements/<tag-name>/` (auto-registered),
`templates/<Name>/` (`.tsx` + `.schema.ts` + `.module.scss`), `bundles/`,
`plugins/`, `root.config.ts`. Schema APIs (`defineSchema`, `defineCollection`,
and field builders) come from `packages/root-cms/core/schema.ts`.

## Best Practices for Agents

### UI Development

- Avoid manually importing custom element definitions (these are collected by Root.js during the build process).
- The CMS UI is Preact + Mantine. **Mantine is pinned to 4.2.12** for Preact
  compat; `react`/`react-dom` alias to `@preact/compat`. Don't upgrade it casually.
- Components live at `ui/components/<Name>/<Name>.tsx` with a colocated plain
  `<Name>.css` whose root class is the component name.
- Use `joinClassNames` from `ui/utils/classes.js`, icons from
  `@tabler/icons-preact`, and notifications via `ui/utils/notifications.js`.

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
- **Model Name**: Include the model name in the description, e.g. "Generated with {APP_NAME} ({MODEL_NAME})".
