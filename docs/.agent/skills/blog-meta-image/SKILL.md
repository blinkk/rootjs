---
name: blog-meta-image
description: >-
  Generate, render, and upload social meta (Open Graph / Twitter card) images
  for Root.js blog posts in `docs/` (`rootjs.dev/blog`). Use this when creating
  a new blog post in the `BlogPosts` collection, refreshing an existing post's
  `meta.image`, or designing a `1200x630` blog share card. Triggers on requests
  mentioning "blog meta image", "blog OG image", "social image for blog post",
  or `BlogPosts` meta images.
---

# Generating Blog Post Meta Images (`rootjs.dev`)

Blog posts on `rootjs.dev` (`BlogPosts/<slug>`) use the **Architectural Editorial Card** style rendered through the `docs/screenshots/` Preact + Playwright pipeline at `1200×630` CSS pixels (`@2x` = `2400×1260` PNG).

All commands below run from the `docs/` directory.

## Architecture

| File | Role |
| --- | --- |
| `docs/screenshots/ui/blog.tsx` | Shared `<BlogMetaImage>` component and pixel-art `<BeetIcon>` |
| `docs/screenshots/scenes/Blog<PascalSlug>.tsx` | One scene file per blog post (`meta.id = "blog-<slug>"`) |
| `docs/screenshots/.out/blog-<slug>.png` | Rendered `2400×1260` PNG (gitignored) |
| `docs/screenshots/screenshots.json` | Checked-in map of uploaded GCS / GCI URLs (`lh3.googleusercontent.com/...`) |

## Step 1 — Read the blog post from the CMS

Fetch the draft doc to get its title, description, publish timestamp, and section highlights:

```bash
npx root-cms client.call getDoc '["BlogPosts", "<slug>", {"mode": "draft"}]'
```

Derive the card fields from the doc:

- **`date`**: Format ` doc.sys.firstPublishedAt || doc.sys.publishedAt || doc.sys.createdAt ` in `America/Los_Angeles` time as `"Month D, YYYY"` (e.g. `"May 20, 2026"`), matching `formatBlogPostDate()` in `docs/utils/blog.ts`. If the post has not been published yet, use the target publish date.
- **`title`**: `doc.fields.meta.title` (e.g. `"Announcing Root.js v3.0"`). `<BlogMetaImage>` automatically steps the headline down from `60px` to `52px` when the title exceeds 36 characters.
- **`description`**: `doc.fields.meta.description` (aim for 1–2 lines, roughly 45–85 characters).
- **`badge`**: A concise monospace label (≤ 20 characters) shown under the pixel-art beet in the right tile — e.g. a package/version tag (`"@blinkk/root v3.0"`), CLI command (`"npm create root"`), or motto (`"Build. Edit. Ship."`).
- **`pills`**: 3–4 short feature or topic labels drawn from the post's main sections. Keep each pill concise (~12–22 characters) so all pills fit on a **single row** at the bottom of the card without wrapping.

## Step 2 — Create the scene file

Create `docs/screenshots/scenes/Blog<PascalSlug>.tsx` (for example, `BlogRootjsV3.tsx` for `BlogPosts/rootjs-v3`):

```tsx
import type {SceneMeta} from '../types.js';
import {BlogMetaImage} from '../ui/blog.js';

export const meta: SceneMeta = {
  id: 'blog-rootjs-v3',
  width: 1200,
  height: 630,
  alt: 'Announcing Root.js v3.0 — A native JSX renderer, a smarter CMS, and a faster build pipeline.',
};

/** Meta image scene for `BlogPosts/rootjs-v3`. */
export default function BlogRootjsV3() {
  return (
    <BlogMetaImage
      date="May 20, 2026"
      title="Announcing Root.js v3.0"
      description="A native JSX renderer, a smarter CMS, and a faster build pipeline."
      badge="@blinkk/root v3.0"
      pills={[
        'Root AI + Tools',
        'Native JSX Renderer',
        'Vite 8 (Rolldown)',
        'Plugin Pods',
      ]}
    />
  );
}
```

### Customizing the right-hand tile (optional)

By default, `<BlogMetaImage>` renders the large pixel-art `<BeetIcon height={160} />` inside the right-hand emblem tile. To substitute custom artwork for a specific post while keeping the rest of the card identical, pass the optional `artwork` prop on `<BlogMetaImage>`.

## Step 3 — Render and visually inspect the PNG

Render the scene from `docs/`:

```bash
node scripts/screenshots_render.ts --scene blog-<slug>
```

Always inspect the rendered file at `docs/screenshots/.out/blog-<slug>.png` before uploading:

- Verify the title and description wrap cleanly without colliding with the top header or bottom pills.
- Verify the `pills` array stays on **one horizontal row** (shorten individual pill labels if they wrap to a second line).
- Verify the `badge` text fits comfortably inside the dark aubergine pill in the right tile.

## Step 4 — Upload to GCS and update `screenshots.json`

Once the visual check passes, upload the rendered PNG (requires Application Default Credentials via `gcloud auth application-default login`):

```bash
node scripts/screenshots_upload.ts --scene blog-<slug>
```

If `screenshots_upload.ts` reports that rendered screenshots are stale relative to the scene sources, run a full render first (`node scripts/screenshots_render.ts`) so `docs/screenshots/.out/manifest.json` has the current `sourceHash`, then re-run the upload.

This writes the entry (`src`, `width`, `height`, `alt`, `gcsPath`, `hash`) to `docs/screenshots/screenshots.json`.

## Step 5 — Attach `meta.image` to the blog post

Read the uploaded entry from `docs/screenshots/screenshots.json` under `"blog-<slug>"`.

- **To update the draft directly in the CMS** (when asked to save/apply the image):
  ```bash
  npx root-cms client.call updateDraftData '[
    "BlogPosts/<slug>",
    "meta.image",
    {
      "src": "https://lh3.googleusercontent.com/...",
      "width": 2400,
      "height": 1260,
      "alt": "<title> — <description>"
    }
  ]'
  ```
- **To propose the change for PR review** (see the `root-cms-propose` skill):
  Add a `doc.edit` operation setting ` path: meta.image ` on `docId: BlogPosts/<slug>`.
