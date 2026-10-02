# Screenshots

The product screenshots on rootjs.dev (the landing page, the guides at
`/guides/`, and blog post images) are rendered from code. Each screenshot is a
TSX "scene" that recreates a piece of the CMS UI with fixture data. The scenes
are rendered to PNGs with Playwright and uploaded to the CMS asset library,
where the site's docs use them.

## Updating screenshots

Run everything from `docs/`. Uploading needs application-default credentials
(`gcloud auth application-default login`).

```sh
# 1. Render and upload every screenshot. Unchanged images are skipped.
pnpm screenshots:publish

# 2. Commit the updated screenshots/screenshots.json.
```

3. In the CMS, publish the docs that use the updated screenshots. The upload
   prints the drafts it updated (`updated draft(s): ...`). Put them in a release
   to publish them together.

The upload replaces each screenshot's file in the asset library, and the asset
library updates every draft that uses it. You don't need to re-seed or edit any
docs, but the changes stay in the drafts until the docs are published.

To work on a single screenshot:

```sh
node scripts/screenshots_render.ts --serve                      # preview scenes in a browser
node scripts/screenshots_render.ts --scene cms-root-ai          # render one scene
node scripts/screenshots_upload.ts --scene cms-root-ai --dry-run
node scripts/screenshots_upload.ts --scene cms-root-ai
```

The rendered PNGs are written to `screenshots/.out/` and never committed. Check
them before uploading. The upload refuses PNGs rendered from older scene
sources, so after pulling changes, re-render everything before uploading
(`pnpm screenshots:publish` does both).

## Using a screenshot in a doc

Screenshots live in the asset library's `screenshots/` folder, named
`<scene-id>.png`. To use one in a doc, pick it from the asset library in the
image field. A URL pasted into the field won't be updated when the screenshot
changes.

Seed scripts (e.g. `scripts/seed_guides.ts`) read `screenshots.json` and use
`screenshotImage()` from `scripts/screenshots_map.ts`, which links the image
to the asset by its `assetId`.

If image fields end up holding a screenshot URL without a link to the asset
(for example, a pasted URL), link them again with:

```sh
node scripts/screenshots_link_docs.ts --dry-run
node scripts/screenshots_link_docs.ts
```

## Adding a screenshot

1. Add a scene to `scenes/`, exporting a `meta` with a unique `id`, the
   viewport size and alt text, and a default component:

   ```tsx
   import type {SceneMeta} from '../types.js';
   import {CmsFrame} from '../ui/cms.js';

   export const meta: SceneMeta = {
     id: 'cms-example',
     width: 960,
     height: 600,
     alt: 'Describe what the screenshot shows.',
   };

   export default function Example() {
     return <CmsFrame active="content">...</CmsFrame>;
   }
   ```

2. Render and upload it, then pick it from the asset library in a doc (or
   reference it by scene id in a seed script).

Build scenes from the UI kit in `ui/` (`cms.tsx` for the CMS chrome, fields
and avatars, `garden.tsx` for illustrations, `blog.tsx` for blog post images).
When the CMS UI changes, update the kit or the affected scenes so the
screenshots stay accurate, then re-publish them.

The scenes show a fictional garden store, **Fernwood Market**, selling root
vegetables. Keep fixture copy and users (`USERS` in `ui/cms.tsx`) consistent
across scenes, and use the robot icon (`IconRobot`) for AI features, matching
the CMS.

| What                                 | Where                                      |
| ------------------------------------ | ------------------------------------------ |
| Scenes (one TSX file per screenshot) | `screenshots/scenes/*.tsx`                 |
| Shared UI kit                        | `screenshots/ui/`                          |
| Scene id → asset id and URL          | `screenshots/screenshots.json` (committed) |
| Render, upload and link scripts      | `scripts/screenshots_*.ts`                 |
