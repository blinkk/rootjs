# rootjs.dev redesign: Root.js as a web platform

The redesigned landing page is staged in the CMS at **`Sandbox/index`**
(previewed at `/sandbox/`). It replaces two pages, the "web development tool"
page (`/`) and the "CMS plugin" page (`/products/cms`), with one story:
**Root.js is a web platform**. The framework and the CMS are two halves of the
same product, and AI works across both.

## Workflow

Run everything from `docs/`.

```sh
# 1. Render the UI screenshots (TSX scenes → PNGs in screenshots/.out/).
node scripts/screenshots_render.ts

# 2. Upload them to the CMS asset library (screenshots/ folder) and update
#    screenshots/screenshots.json. Drafts that use a screenshot are updated.
node scripts/screenshots_upload.ts

# 3. Write the page to Sandbox/index (refuses to overwrite without --force).
node scripts/seed_sandbox_index.ts --dry-run
node scripts/seed_sandbox_index.ts
```

The same steps are available as `pnpm screenshots:render`,
`pnpm screenshots:upload` and `pnpm seed:sandbox-index`, and
`pnpm screenshots:publish` runs the first two together. The upload refuses PNGs
rendered from older scene sources, so pull, then re-render before uploading. Steps 2 and 3 need
application-default credentials
(`gcloud auth application-default login`).

| What                                     | Where                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Page copy and module order               | `scripts/sandbox_index_content.ts`                                            |
| Screenshot scenes (one TSX file per PNG) | `screenshots/scenes/*.tsx`                                                    |
| Shared CMS UI mockup kit                 | `screenshots/ui/`                                                             |
| Uploaded screenshot URLs                 | `screenshots/screenshots.json` (checked in)                                   |
| New templates                            | `templates/Template{Hero,Pillars,FeatureSpotlight,FeatureGrid,CodeShowcase}/` |

To preview a scene while you work on it, run
`node scripts/screenshots_render.ts --serve` and open the printed URL. To
re-render one scene, pass `--scene <id>`. PNGs are never committed: the upload
script skips images that haven't changed.

Screenshots live in the CMS asset library under `screenshots/`, and seeded
image fields link to them by `assetId`. Re-uploading a screenshot updates every
draft that uses it, so after an upload, publish the updated drafts to make the
new screenshots live. Image fields that hold a screenshot URL without an
`assetId` (e.g. set before the asset library was used) can be linked with
`pnpm screenshots:link-docs` (pass `--dry-run` first).

The scenes show a fictional garden store, **Fernwood Market**, selling root
vegetables (illustrated in `screenshots/ui/garden.tsx`). Keep fixture copy
consistent across scenes, and use the robot icon (`IconRobot`) for AI features,
matching the CMS. Avoid sparkles.

To use a screenshot elsewhere on the site, import the map:

```ts
import screenshots from '@/screenshots/screenshots.json';
const {assetId, src, width, height, alt} = screenshots['cms-root-ai'];
```

## Page outline

| #   | Module                     | Content                                    | Screenshot           |
| --- | -------------------------- | ------------------------------------------ | -------------------- |
| 1   | `TemplateHero`             | The platform pitch, CTAs and `npm create`  | `cms-editor-preview` |
| 2   | `TemplatePillars`          | Build / Manage / Automate                  | none                 |
| 3   | `TemplateFeatureSpotlight` | CMS feature #2: Root AI                    | `cms-root-ai`        |
| 4   | `TemplateCodeShowcase`     | CMS feature #3: content as code            | none (live code)     |
| 5   | `TemplateFeatureSpotlight` | CMS feature #4: publishing                 | `cms-publish-checks` |
| 6   | `TemplateFeatureSpotlight` | CMS feature #5: localization               | `cms-translations`   |
| 7   | `TemplateFeatureSpotlight` | CMS feature #6: collaboration              | `cms-field-comments` |
| 8   | `TemplateFeatureGrid`      | CMS features #7–14                         | none                 |
| 9   | `TemplateFeatureGrid`      | Framework features (from the old `/` page) | none                 |
| 10  | `TemplateHero` (dark)      | Closing CTA                                | none                 |

CMS feature #1, live preview, is the hero image. `cms-releases` is rendered and
uploaded too, but isn't placed on the page. Use it if you'd rather show
releases than the publish dialog in section 5.

## CMS features, ranked

The ranking considers how much each feature shapes the daily experience of
evaluating and using Root, and how much it sets Root apart from other headless
CMSes. Each feature has a primary tagline (the one used on the page, where the
feature has its own section) and alternates.

| #   | Feature                                                                                                                                                                                                                 | Tagline                                       | Alternates                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | **Live preview & visual editing.** A split editor and preview with desktop, tablet and mobile side by side. Click any element to jump to its field.                                                                     | See every change before it ships.             | Edit the page, not a form. · What you see is what you publish.                      |
| 2   | **Root AI.** Chat in the CMS that reads and edits docs, schemas and releases through tools. It has read, approve and auto modes, supports any model provider, and adds AI summaries, translations, alt text and images. | An AI teammate that knows your content model. | Ask for it. Review it. Ship it. · AI with guardrails, not guesswork.                |
| 3   | **Content as code.** Schemas in TypeScript, generated types, presets, and a rich field library (rich text with custom blocks, references, oneOf, and more).                                                             | Your content model lives in your repo.        | Content models are code. Types come free. · Schemas in git, not in a settings page. |
| 4   | **Publishing workflow.** Drafts, diffs, scheduled publishing, releases that bundle docs and data sources, and AI-written publish messages.                                                                              | Ship content like you ship code.              | Launch day, on autopilot. · Schedule it, bundle it, ship it.                        |
| 5   | **Localization.** A per-doc translations editor, CSV / Google Sheets / ARB exchange, pluggable providers (e.g. Crowdin), one-click AI translation, locale fallbacks and hreflang.                                       | Every locale, one workflow.                   | Go global without the spreadsheet chaos. · Translate once, render everywhere.       |
| 6   | **Collaboration.** Field comment threads with @mentions, pinned threads, live presence avatars, notifications and an experimental task manager.                                                                         | Feedback right where the words live.          | Comments on the field, not in the chat. · Your whole team, on the same page.        |
| 7   | **Version history.** Automatic versions and a tagged version on every publish. Versions can be compared, restored or copied, and fields have their own history.                                                         | Every change, recoverable.                    | Undo, all the way back.                                                             |
| 8   | **Publishing checks.** Required or advisory server-side checks that run in the publish flow (a translations check is built in).                                                                                         | Catch problems before your users do.          | Guardrails for every publish.                                                       |
| 9   | **Agent-ready CLI & change proposals.** The `root-cms` CLI exposes the client as JSON, and installable agent skills let AI agents propose YAML changes that go through PR review and CI.                                | Content changes, reviewed like pull requests. | Built for agents. Reviewed by humans.                                               |
| 10  | **Asset library.** Folders, bulk upload, Figma and Google Drive sync, and on-the-fly resizing through the image service.                                                                                                | Assets that stay in sync with design.         | From Figma to production, automatically.                                            |
| 11  | **Data sources.** Syncs Google Sheets and HTTP data on a schedule and publishes it with releases.                                                                                                                       | Bring your data along.                        | Spreadsheets in, structured content out.                                            |
| 12  | **Roles, permissions & locks.** Admin, Editor, Contributor and Viewer roles, domain-wide grants, per-collection permission groups, and publishing locks with expiry.                                                    | The right hands on the right content.         | Access control without the admin headache.                                          |
| 13  | **Extensibility.** Custom sidebar tools, themes, `onAction` hooks, notification services and an embeddable editor (`@blinkk/root-cms/browser-client`).                                                                  | Make the CMS your own.                        | Your CMS, your tools.                                                               |
| 14  | **Global search.** A ⌘K spotlight across docs and fields, plus in-editor search.                                                                                                                                        | Find anything with ⌘K.                        | Every doc, one keystroke away.                                                      |

## Framework features

These carry over from the old `/` page and appear in section 9.

| Feature                                                      | Tagline                                |
| ------------------------------------------------------------ | -------------------------------------- |
| Server-rendered TSX (SSR + SSG, parallel builds)             | Zero JavaScript unless you ask for it. |
| Web component islands                                        | Ship interactivity, not bundles.       |
| File-based routing                                           | Routes are files.                      |
| Built-in i18n (localized URLs, fallbacks, hreflang sitemaps) | Localized out of the box.              |
| Plugins & pods                                               | Extend the server, build and CMS.      |
| Deploy (Firebase, App Engine) and secrets sync               | One command to production.             |

## Open questions for review

- **Hero headline.** Options: "Build the site. Run the content. Ship it
  together." (current), "The web platform for teams that ship." or "One
  platform for the code and the content."
- **Launch.** The "CMS" nav link and the Root.js / Root CMS logo toggle are
  gone, and `/products/cms` 301-redirects to `/`. To launch, publish this
  content as `Pages/index`.
- **Links.** Buttons point to `/docs/` and GitHub. Deep links into specific
  docs pages can be added once the docs structure is final.
