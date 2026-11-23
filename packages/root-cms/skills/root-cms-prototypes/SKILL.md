---
name: root-cms-prototypes
description: >-
  Create, inspect, and iterate on high-fidelity UX prototypes in Root.js CMS
  (`/cms/prototypes`) from the command line using full local codebase context.
  Use when designing page mocks, layout explorations, or addressing reviewer
  comments on Root CMS prototype artboards (`root-cms prototypes.*`).
---

# Root.js CMS UX Prototypes (`root-cms prototypes.*`)

Root CMS includes an isolated infinite-canvas prototyping workspace at
`/cms/prototypes` where teams view side-by-side page explorations, pan/zoom,
drop `@mention` comment pins on blocks, and export `@2x` PNGs.

When running locally with full repository access (routes, templates, elements,
SCSS tokens, and CMS content), use the `root-cms prototypes.*` CLI commands to
author high-fidelity mocks grounded in the project's real components and brand
styles and push them straight into Firestore.

## Prerequisites

- Run commands from the Root.js project directory containing `root.config.ts`.
- Authenticate with Application Default Credentials (`gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS`).
- Invoke via `npx root-cms ...` (or `pnpm exec root-cms ...`).

## Core Workflow

### 1. Ground Your Mock in the Real Codebase & Content

Before writing prototype HTML, inspect the project directly on disk:

1. **Brand tokens & typography**: Read `ROOT.md`, `styles/` (colors, font stacks, Google Fonts URLs, spacing, radii), and `layouts/` or `components/GlobalHeader` / `GlobalFooter`.
2. **Existing templates & elements**: Read `templates/`, `components/`, `blocks/`, and `elements/` to understand the site's real visual patterns and section schemas.
3. **Live CMS copy (when riffing on an existing page)**: Run `npx root-cms docs.get Pages/index` (or `npx root-cms client.call listDocs '["Pages", {"mode": "draft"}]'`) so mocks use real headlines, CTAs, and product copy rather than placeholder filler.

### 2. List or Create a Prototype Board

```bash
# List active prototype boards
npx root-cms prototypes.list --json

# Create (or --upsert) a board; brand tokens from styles/ are extracted automatically
npx root-cms prototypes.create pricing-refresh \
  --title "Pricing page refresh" \
  --description "Three-tier comparison explorations for Q4" \
  --upsert
```

To customize Google Fonts or `@theme` CSS variables on the board:

```bash
npx root-cms prototypes.update pricing-refresh --theme '{
  "fontSans": "Inter, system-ui, sans-serif",
  "fontHeading": "\"Instrument Serif\", Georgia, serif",
  "fontUrls": ["https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600;700&display=swap"],
  "colorBg": "#ffffff",
  "colorFg": "#111827",
  "colorPrimary": "#15803d",
  "colorOnPrimary": "#ffffff",
  "colorBorder": "#e5e7eb"
}'
```

### 3. Author & Upload High-Fidelity Artboard Frames

Every prototype frame renders inside a sandboxed `<iframe sandbox="allow-scripts">`
powered by a live **Tailwind v4** compiler and the board's `@theme` variables
(`var(--color-bg)`, `var(--color-surface)`, `var(--color-fg)`, `var(--color-muted)`,
`var(--color-primary)`, `var(--color-on-primary)`, `var(--color-border)`,
`var(--font-sans)`, `var(--font-heading)`, `var(--font-mono)`).

The easiest way to author a frame is an `.html` file segmented with
`<!-- @block ... -->` markers. Each `@block` becomes an individually selectable,
commentable block on the CMS canvas (and `proposed="true"` highlights net-new
components with a `Proposed · <Label>` badge):

```html
<!-- @block key="header" component="GlobalHeader" label="Global header" -->
<header class="border-b border-gray-200 bg-white px-10 py-4">
  <div class="mx-auto flex max-w-6xl items-center justify-between">
    <span class="text-lg font-bold tracking-tight text-gray-900">Acme</span>
    <nav class="flex items-center gap-6 text-sm font-medium text-gray-600">
      <a href="#features">Features</a>
      <a href="#pricing" class="text-gray-900">Pricing</a>
      <a href="#docs">Docs</a>
    </nav>
    <a href="#signup" class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white">Start free</a>
  </div>
</header>

<!-- @block key="hero" component="Hero" label="Pricing hero" -->
<section class="bg-white px-10 pt-20 pb-12 text-center">
  <h1 class="mx-auto max-w-3xl text-5xl font-bold tracking-tight text-gray-900">
    Simple, predictable pricing for growing teams
  </h1>
  <p class="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
    Unlimited preview environments and localized releases included on every plan.
  </p>
</section>

<!-- @block key="matrix" component="PricingMatrix" label="Pricing matrix" proposed="true" -->
<section class="bg-white px-10 py-12">
  <!-- 3-tier comparison grid -->
</section>

<!-- @block key="footer" component="GlobalFooter" label="Global footer" -->
<footer class="border-t border-gray-200 bg-gray-50 px-10 py-12 text-sm text-gray-500">
  <div class="mx-auto flex max-w-6xl justify-between">
    <span>© 2026 Acme Inc.</span>
    <span>Privacy · Terms · Security</span>
  </div>
</footer>
```

Push one or more variant frames to the board (new frames without `--x`/`--y` are
automatically placed side-by-side without overlapping):

```bash
# Desktop variants (1440px)
npx root-cms prototypes.frame.set pricing-refresh variant-a ./variant-a.html \
  --title "Variant A · Editorial" \
  --width 1440

npx root-cms prototypes.frame.set pricing-refresh variant-b ./variant-b.html \
  --title "Variant B · Three-Tier Matrix" \
  --width 1440

# Mobile variant (390px) on a second page
npx root-cms prototypes.update pricing-refresh --add-page "Mobile"
npx root-cms prototypes.frame.set pricing-refresh mobile-b ./mobile-b.html \
  --page mobile \
  --title "Variant B · Mobile" \
  --width 390
```

### 4. Inspect & Address Reviewer Comments

Team members can review the board at `/cms/prototypes/<boardId>` and pin
comments directly to frames or individual `@block` sections. Pull open comments,
export frames to disk to edit, push updates, and resolve addressed threads:

```bash
# Read open reviewer comments as JSON
npx root-cms prototypes.comments pricing-refresh --json

# Export all frames (.html + .json) and comments to a local working folder
npx root-cms prototypes.get pricing-refresh ./tmp/pricing-refresh

# Push updated frame HTML after addressing feedback
npx root-cms prototypes.frame.set pricing-refresh variant-b ./tmp/pricing-refresh/frames/variant-b.html

# Optionally mark addressed comment threads resolved
npx root-cms prototypes.comments pricing-refresh --resolve <threadId>
```

## Sandbox & HTML Rules

- **Self-contained markup**: Do not import `.tsx` modules or external JS. Write clean semantic HTML styled with Tailwind v4 utilities, inline `svg` icons, and optional `--css <file.css>`.
- **Sanitized automatically**: `<script>`, `<iframe>`, inline `on*` attributes, `javascript:` URLs, and CSS `@import` are stripped on save; `100vh` is rewritten against `--proto-vh` (`900px` desktop / `844px` mobile) so frames size cleanly to their content height without infinite resize loops.
- **Allowed external assets**: `<img>` may only load the project's own CMS assets (`https://lh3.googleusercontent.com/...` or `https://storage.googleapis.com/<project bucket>/...`) and `data:` URIs; images from any other host are blocked, so use an inline `svg` or a styled placeholder block instead. Fonts load from `https://fonts.googleapis.com` URLs (configured via `prototypes.update --theme`).
