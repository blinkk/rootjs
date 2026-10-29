---
name: root-cms-theme
description: >-
  Generate a theme for the Root.js CMS UI: a CSS file that restyles the CMS
  with a brand's colors, fonts, density, corner shape or a dark mode, using
  the `--cms-*` custom properties. Either register it as a shared theme in
  `cmsPlugin({themes})` or hand over CSS to paste under Settings → Theme
  (Project CSS or Personal CSS). Use this when asked to "theme the CMS", "make
  the CMS match our brand", "add a dark mode to the CMS", "change the CMS's
  colors/font/density", or to write CSS for the CMS's settings page.
---

# Theming the CMS

A CMS theme is a stylesheet loaded after the CMS's own. The supported way to
restyle the CMS is to set `--cms-*` custom properties on `:root`: every color,
font, type size, radius, shadow and spacing the UI uses reads one of them, and
their names and meanings are kept stable across releases. Themes are
experimental, so the markup underneath can change; a theme that only sets
properties keeps working when it does.

Two files ship next to this one:

- `theme.css`: the stock theme, with every property the CMS reads, its default
  value and a note on what it's for. It matches the CMS version this skill was
  installed from. If the project's `@blinkk/root-cms` has since been upgraded,
  refresh the skill first with
  `pnpm exec root-cms skill.install --skill root-cms-theme --force`.
- `examples/acme.css`: a full example, with a brand color, a web font and a
  dark mode that follows the OS.

The script `scripts/check-theme.mjs` checks a theme for contrast problems and
typos. Run it on every theme before handing it over.

## Step 1 — Agree on the look and where it goes

Ask these together, once. A link to the brand's website, a logo or a
screenshot is as good as a list of colors: take the colors from it and say
which ones you picked.

| Question                                                             | Default         |
| -------------------------------------------------------------------- | --------------- |
| Brand colors (or something to take them from)                        | none, must ask  |
| Light, dark, or both (dark follows the OS setting)                   | light           |
| Font (a Google Fonts family, or a font the CMS's users already have) | the CMS's Inter |
| Density: as is, or compact                                           | as is           |
| Corners: as is, square, or rounder                                   | as is           |
| Where it goes (see below)                                            | a shared theme  |

There are three places a theme can go:

- **A shared theme** (best for a team). A CSS file in the repo, registered in
  `cmsPlugin({themes})`. Everyone can pick it under **Settings → Theme**, and
  it can be the project's default. It ships with a deploy.
- **Project CSS**. Pasted by an admin under **Settings → Theme → Project
  CSS**. It applies to everyone on the project, on top of their theme, with
  no deploy.
- **Personal CSS**. Pasted under **Settings → Theme → Personal CSS**. It
  applies only to the person who pastes it.

If the user isn't in the project's repo, or doesn't want to deploy, write CSS
to paste. For a shared theme, also ask for its name (e.g. "Acme") and whether
it should be the default for everyone.

## Step 2 — Write the theme

Read `theme.css` first; it's the list of everything you can set. Then write a
theme that:

- **Sets properties on `:root`, and only the ones that change.** Don't copy
  the whole stock file: stock values get fixes and refinements between
  releases, and a copied value freezes the old one.
- **Starts with a comment** saying what the theme is and what it changes.
- **Uses the brand where the CMS uses its accent and actions**:
  `--cms-accent` (active tabs, nav items and inline groups),
  `--cms-color-primary`, `--cms-color-primary-hover` and
  `--cms-color-on-primary` (filled buttons), `--cms-color-link` and
  `--cms-color-focus`. A faint tint of the brand in `--cms-color-page` works
  well; keep `--cms-color-surface` close to white (or to the dark page) so
  inputs and cards stay readable.
- **Keeps status colors meaning what they mean.** Success stays green, danger
  red, warning amber, info blue, even when the brand is red or green. Adjust
  them only for contrast or a dark mode.
- **Ties related values together with `var()`**, e.g.
  `--cms-color-focus: var(--cms-accent);`.

### Dark mode

A dark theme has to replace every light value, not just the page: surfaces,
chips and overlays, lines, text, primary buttons, inputs, each status's
strong, soft and line colors, violet, the soft button fills and the task
status tints. Go through `theme.css` group by group. Also set
`color-scheme: dark` so scrollbars and native controls match.

For a theme that's light or dark with the user's OS, put the dark values in
`@media (prefers-color-scheme: dark) { :root { ... } }`, as
`examples/acme.css` does. For a dark-only theme, put them straight in `:root`.

### Fonts

Load a web font with an `@import` at the very top of the file (browsers ignore
an `@import` after any other rule), then set `--cms-font-sans` with a
fallback:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap');

:root {
  --cms-font-sans: 'Inter Tight', 'Inter', sans-serif;
}
```

Load the weights 400, 500, 600 and 700; the UI uses all four.
`--cms-font-mono` is for code and JSON.

### Density and shape

For a compact theme, lower the type scale (`--cms-text-*`), the control
heights (`--cms-control-height-*`), `--cms-page-padding` and
`--cms-field-gap` together, by a step each, rather than shrinking one. Keep
`--cms-text-sm` at 11px or more. For corners, change the four `--cms-radius-*`
values together (`0` for square). The `--cms-drawer-*` properties change how
nested field groups look in the document editor: bordered boxes, an indent, or
a rule down the side.

### When a property doesn't reach it

Prefer saying so to reaching for class names. If the user still wants it, the
CMS's BEM classes (`Button--variant-primary`, `DocEditor__statusBar`) are
supported hooks but best effort: a rename is called out in the changelog. The
full list is in
`https://github.com/blinkk/rootjs/blob/main/packages/root-cms/docs/themes.md`.
Never target utility classes such as `.px-3` or `.bg-surface`, or the DOM's
structure; those change with any release. Themes load after the CMS's CSS,
which sits in cascade layers, so a plain selector wins without `!important`.

## Step 3 — Check it

Save the theme to a file (for pasted CSS, a temporary one) and run:

```bash
node <this skill's directory>/scripts/check-theme.mjs path/to/theme.css
```

It layers the theme over the stock values and checks the pairs that matter:
text on each background, button text on buttons, status colors on their soft
backgrounds, and focus rings against the page (4.5:1 for text, 3:1 for the
rest). A dark block is checked as its own mode. It also warns about
properties the CMS doesn't read, unsupported selectors, `!important`, and a
misplaced `@import`.

Fix every `✗` and run it again until it exits cleanly. A `?` means it couldn't
read a color (e.g. `color-mix()` or `oklch()`); check that pair by hand, or
use a hex value. Treat the warnings as things to fix or explain to the user.

## Step 4 — Hand it over

### A shared theme

Save it as `cms/themes/<id>.css` and register it in `root.config.ts`:

```ts
cmsPlugin({
  // ...
  themes: [{id: 'acme', name: 'Acme', file: './cms/themes/acme.css'}],
  // Only if the user wants it on for everyone who hasn't picked a theme.
  defaultTheme: 'acme',
});
```

- `id` is used in the URL and in each user's preference: lowercase letters,
  digits and hyphens. Don't rename it later, or users who picked it lose their
  choice.
- `file` is relative to the project root. `css` can hold a string instead.
- If there are already themes, add to the list rather than replacing it.

Restart the dev server after changing `root.config.ts`. After that, the file
is read on each request, so edits show on the next reload. Ask the user to
open `http://localhost:4007/cms/settings`, pick the theme under **Theme**, and
look over a few pages, including the document editor and a modal. Iterate on
what they report, re-running the check each time.

Commit the CSS file and the config change; it goes live with the next deploy.

### Project or Personal CSS

Give the user the CSS in one code block, ready to paste, and tell them where
it goes: **Settings → Theme → Project CSS** (admins only, applies to everyone)
or **Personal CSS** (applies to them). It saves when the field loses focus and
applies straight away.

Instead of pasting the whole theme, the field can pull in a hosted file with
`@import url("https://…");`. The host must serve it as `text/css`:
`raw.githubusercontent.com` serves `text/plain`, which browsers refuse to load
as a stylesheet, but jsDelivr serves files from a GitHub repo correctly, e.g.
`https://cdn.jsdelivr.net/gh/<owner>/<repo>@<branch>/cms/themes/acme.css`.

## Step 5 — Wrap up

Tell the user, briefly:

- What the theme changes, and the colors you picked if you took them from a
  site or an image.
- Where it lives and how people turn it on.
- That themes are experimental: after upgrading the CMS, refresh this skill
  and run the check again, and re-check any BEM-hook rules by eye.

## Guidance for agents

- Ask for the brand colors, or something to take them from. Don't invent a
  palette and present it as the brand's.
- Only set `--cms-*` properties unless the user asks for more, and never edit
  the CMS's own CSS in `node_modules`.
- Don't hand over a theme that fails the contrast check without saying which
  pairs fail and why the user wants it anyway.
- Ask before changing `defaultTheme`; it changes the CMS for everyone who
  hasn't picked a theme.
