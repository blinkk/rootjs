# Editor theme

> **Experimental.** The editor's markup changes as features are added, so a
> theme may need adjusting from version to version. The `--cms-*` custom
> properties below are the part meant to last; everything else is best
> effort.

A theme restyles the Root CMS document editor with a stylesheet loaded
after the editor's own.

## The project theme

`cmsPlugin({theme})` in `root.config.ts` styles the editor for everyone on
the project:

```ts
cmsPlugin({
  theme: {file: './cms-theme.css'},
});
```

`file` is relative to the project root. `css` can be added to append a few
rules after the file, or be the whole theme on its own:

```ts
theme: {file: './cms-theme.css', css: ':root { --cms-drawer-indent: 32px; }'}
```

The stylesheet is served at `/cms/theme.css` behind the editor's login and
linked after the base stylesheet, so it wins the cascade without
`!important`. The file is read on each request and the link is cache-busted
by its content, so an edit shows on the next reload.

Each user can switch the project theme off for themselves under
**Settings → User Preferences → Project editor theme**; the choice is stored
with their other preferences and applied on load.

## Custom CSS from the CMS

CSS can also be added without a deploy, from the Settings page:

- **Site Settings → Custom CSS** — applies to everyone on the project
  (admins).
- **User Preferences → Custom CSS** — applies to you only.

Paste CSS directly, or pull in a hosted file with
`@import url("https://…");` (a stylesheet in a GitHub repo, served raw,
works). The cascade order is: base stylesheet, project theme, site custom
CSS, user custom CSS — later wins.

## What is stable

The supported surface is the `--cms-*` custom properties below. They are the
contract: their names and meanings are kept stable across releases, and a
theme written only against them keeps working when the editor's markup
changes.

Rules that target the editor's class names or DOM structure are **not**
supported. They work today and may break with any release — the editor's
markup is free to change, and nothing in the build checks such selectors. A
theme that reaches past the properties should be re-checked after every
upgrade.

Set the properties on `:root`. Every property defaults to the stock value, so
an unthemed editor renders exactly as it did before themes existed.

### Structure

| Property                 | Default       | Meaning                                                                                               |
| ------------------------ | ------------- | ----------------------------------------------------------------------------------------------------- |
| `--cms-drawer-bleed`     | `-16px`       | How far a field group's box runs past the field column on each side (`0` keeps it inside the column). |
| `--cms-drawer-border`    | `none`        | Border around a field group (a `border` shorthand).                                                   |
| `--cms-drawer-radius`    | `0`           | Corner radius of a field group.                                                                       |
| `--cms-drawer-bg`        | `transparent` | Background of a field group.                                                                          |
| `--cms-drawer-header-bg` | `transparent` | Background of a field group's header row.                                                             |
| `--cms-drawer-indent`    | `0`           | Extra space before a field group's fields (a length).                                                 |
| `--cms-drawer-rule`      | `none`        | A rule down that space (a `border` shorthand).                                                        |
| `--cms-accent`           | `lightblue`   | The structural accent: open list items, inline groups.                                                |

### Type and rhythm

| Property           | Default   | Meaning                              |
| ------------------ | --------- | ------------------------------------ |
| `--cms-font-size`  | `12px`    | Base size for the editor's own text. |
| `--cms-label-size` | `12px`    | Field labels.                        |
| `--cms-help-size`  | `12px`    | Help text beneath a label.           |
| `--cms-help-color` | `inherit` | Its colour.                          |
| `--cms-field-gap`  | `16px`    | Vertical space between fields.       |

Need a dial that isn't here? Add the property to the base stylesheet with the
stock value as its fallback, list it in this file, and use it from the theme —
that keeps the contract honest rather than reaching for a class name.
