# Root.js guides

Non-technical guides to Root.js, written for decision makers: marketing and
content leads, product owners, and anyone choosing a content platform. They
explain what each feature does for a team, with screenshots from the app, and
leave setup to the developer docs.

| URL          | Collection | What                                                |
| ------------ | ---------- | --------------------------------------------------- |
| `/guides/`   | `Guides`   | These guides. The index lists every `Guides` doc.   |
| `/docs/`     | `Docs`     | Technical docs for developers (formerly `/guide/`). |
| `/guide/...` | none       | 301 redirects to `/docs/...` (see `root.config.ts`) |

## Workflow

Run everything from `docs/`. The seed script needs application-default
credentials (`gcloud auth application-default login`).

```sh
# 1. Write the guides to the Guides collection. Existing drafts are skipped
#    unless you pass --force (which backs them up first).
node scripts/seed_guides.ts --dry-run
node scripts/seed_guides.ts
node scripts/seed_guides.ts --guide publishing --force

# 2. Publish the guides in the CMS once they've been reviewed.
```

The guides' images are screenshots linked to the CMS asset library, so
updating a screenshot doesn't need a re-seed. See
[`screenshots/README.md`](../screenshots/README.md).

## Ordering

The `Guides` collection uses `customSorting`, so the order on the `/guides/`
index (and the "Next guide" fallback) is managed in the CMS: open the
collection, pick the "Custom order" sort, and drag the docs. Like any edit, a
new order goes live when the moved docs are published. Newly seeded guides are
added at the end, in the order they're listed in `scripts/guides_content.ts`.

`pnpm seed:guides` runs step 1.

| What                                     | Where                                              |
| ---------------------------------------- | -------------------------------------------------- |
| Guide copy and screenshots               | `scripts/guides_content.ts`                        |
| Screenshot scenes (one TSX file per PNG) | `screenshots/scenes/*.tsx`                         |
| Shared CMS UI mockup kit                 | `screenshots/ui/`                                  |
| Guide page and index templates           | `routes/guides/[...slug].tsx`, `routes/guides.tsx` |
| Collection schema                        | `collections/Guides.schema.ts`                     |

The scenes show a fictional garden store, **Fernwood Market**. See
`redesign/README.md` for the fixture conventions (users, docs, dates).

## Guides

| #   | Slug                  | Title                                | Screenshots                                                    |
| --- | --------------------- | ------------------------------------ | -------------------------------------------------------------- |
| 1   | `overview`            | Root.js at a glance                  | `cms-editor-preview`, `cms-content-list`, `cms-publish-checks` |
| 2   | `editing`             | Editing and live preview             | `cms-editor-preview`, `cms-content-list`, `cms-global-search`  |
| 3   | `publishing`          | Publishing, scheduling, and releases | `cms-publish-checks`, `cms-releases`, `cms-version-history`    |
| 4   | `localization`        | Localization and translation         | `cms-translations`, `cms-localization-modal`                   |
| 5   | `collaboration`       | Collaboration and review             | `cms-field-comments`, `cms-tasks`                              |
| 6   | `root-ai`             | Root AI                              | `cms-root-ai`, `cms-ai-edit`                                   |
| 7   | `governance`          | Roles, permissions, and governance   | `cms-roles`, `cms-action-logs`                                 |
| 8   | `assets-and-data`     | Assets and data                      | `cms-asset-library`, `cms-data-sources`                        |
| 9   | `extensibility`       | Integrations and extensibility       | `cms-sidebar-tools`                                            |
| 10  | `seo-and-performance` | SEO, accessibility, and performance  | `cms-publish-checks`, `cms-ai-edit`                            |

Each guide has an intro, an "At a glance" list of takeaways, sections with an
optional screenshot and caption, and a "Frequently asked questions" list.

Keep claims accurate to the product. When describing a feature, check the code
(`packages/root-cms/`) rather than the marketing copy, and avoid promising
things that depend on project setup without saying so.
