# Editor themes

A theme restyles the Root CMS document editor. Built-in themes live in this
folder as `<name>.css`, ship with the package, and are served side by side at
`/cms/static/themes/<name>.css`, so one can build on another with
`@import './other.css';`.

## Choosing a theme

`cmsPlugin({theme})` in `root.config.ts` sets the **project default** — what
every user gets until they choose otherwise. Each user can pick a different
built-in theme, or the stock look, for themselves under
**Settings → User Preferences → Editor theme**. That choice is stored with
their other preferences and applied on load.

```ts
theme: 'clarity'                                        // a built-in, as-is
theme: {extends: 'clarity', css: ':root { … }'}        // a built-in plus tweaks
theme: {css: fs.readFileSync('./cms-theme.css', 'utf-8')} // from scratch
```

Project `css` is inlined last and applies on top of whichever built-in the
user has chosen.

## What is stable

The supported surface for project CSS is the `--cms-*` custom properties
below. They are the contract: their names and meanings are kept stable across
releases, and a project theme written only against them keeps working when the
editor's markup changes.

Rules that target the editor's class names or DOM structure are **not**
supported. They work today and may break with any release — the editor's
markup is free to change, and nothing in the build checks such selectors.
Built-in themes in this folder may use class names because they are
maintained with the UI and updated alongside it; a project theme should not.

Set the properties on `:root`. Every property defaults to the stock value, so
an unthemed editor renders exactly as it did before themes existed.

### Structure

| Property | Default | Meaning |
| --- | --- | --- |
| `--cms-drawer-bleed` | `-16px` | How far a field group's box runs past the field column on each side (`0` keeps it inside the column). |
| `--cms-drawer-border` | `none` | Border around a field group (a `border` shorthand). |
| `--cms-drawer-radius` | `0` | Corner radius of a field group. |
| `--cms-drawer-bg` | `transparent` | Background of a field group. |
| `--cms-drawer-header-bg` | `transparent` | Background of a field group's header row. |
| `--cms-drawer-indent` | `0` | Extra space before a field group's fields (a length). |
| `--cms-drawer-rule` | `none` | A rule down that space (a `border` shorthand). |
| `--cms-accent` | `lightblue` | The structural accent: open list items, inline groups. |

### Type and rhythm

| Property | Default | Meaning |
| --- | --- | --- |
| `--cms-font-size` | `12px` | Base size for the editor's own text. |
| `--cms-label-size` | `12px` | Field labels. |
| `--cms-help-size` | `12px` | Help text beneath a label. |
| `--cms-help-color` | `inherit` | Its colour. |
| `--cms-field-gap` | `16px` | Vertical space between fields. |

Need a dial that isn't here? Add the property to the base stylesheet with the
stock value as its fallback, list it in this file, and use it from the theme —
that keeps the contract honest rather than reaching for a class name.

## Built-in themes

- `clarity` — a calmer editor that shows its structure. Field groups and open
  list items become rounded cards whose ground alternates with depth, the
  fields a type picker reveals sit behind a rule, help text steps down beneath
  its label, type steps up a point, and controls share one corner radius with
  the rest of the CMS.
