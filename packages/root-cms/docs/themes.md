# Themes

> **Experimental.** The CMS's markup changes as features are added, so a
> theme may need adjusting from version to version. The `--cms-*` custom
> properties in `ui/styles/theme.css` are the part meant to last; everything
> else is best effort.

A theme is a stylesheet loaded after the CMS's own, so it can restyle
anything its CSS reaches.

## Writing one

Copy `packages/root-cms/ui/styles/theme.css`. It holds every custom property
the CMS reads, at its stock value, with a note on what each one does — that
file is the contract. Change the values, add rules if you need more, and the
result is a theme.

## Registering them

Themes come from the project: a local file, or a package or plugin that
exports one. `cmsPlugin` takes the list and picks which applies by default:

```ts
cmsPlugin({
  themes: [
    {id: 'clarity', name: 'Clarity', file: './cms/clarity.css'},
    ...somePlugin.themes,
  ],
  defaultTheme: 'clarity',
});
```

- `id` — appears in the URL and in a user's preference; lowercase letters,
  digits and hyphens.
- `name` — shown in the picker. Defaults to the id.
- `file` — relative to the project root.
- `css` — a string instead of a file, or appended after one.

Each theme is served at `/cms/themes/<id>.css` behind the CMS's login and
read on each request, so an edit to the file shows on the next reload. The
link is cache-busted by the stylesheet's content.

## Choosing one

Every user picks their own theme under **Settings → User Preferences →
Theme**, from the list the project registered. `defaultTheme` is what applies
until they do; without one, they get the stock CMS.

## Custom CSS from the CMS

CSS can also be added without a deploy, from the Settings page:

- **Site Settings → Custom CSS** — applies to everyone on the project
  (admins).
- **User Preferences → Custom CSS** — applies to you only.

Paste CSS directly, or pull in a hosted file with
`@import url("https://…");` (a stylesheet in a GitHub repo, served raw,
works). The cascade order is: base stylesheet, theme, site custom CSS, user
custom CSS — later wins.

## What is stable

The `--cms-*` custom properties are the supported surface: their names and
meanings are kept stable across releases, and a theme written only against
them keeps working when the markup underneath changes.

Rules that target the CMS's class names or DOM structure are **not**
supported. They work today and may break with any release — the markup is
free to change, and nothing in the build checks such selectors. A theme that
reaches past the properties should be re-checked after every upgrade.

Need a dial that isn't there? Add the property to `ui/styles/theme.css` with
the stock value, use it from the component's CSS, and it becomes part of the
contract — that keeps the contract honest rather than reaching for a class
name.
